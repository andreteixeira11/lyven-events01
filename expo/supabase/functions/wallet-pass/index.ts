// Apple Wallet — gera o bilhete como passe .pkpass assinado.
// POST { ticketId } (Authorization do utilizador) → devolve URL do passe com
// token HMAC de curta duração (10 min).
// GET ?token=... → devolve o .pkpass (o iOS mostra "Adicionar à Apple Wallet").
//
// Atualizações automáticas (Apple Wallet web service, webServiceURL = esta função):
//   POST/DELETE /v1/devices/{device}/registrations/{passType}/{serial}
//   GET         /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=
//   GET         /v1/passes/{passType}/{serial}
//   POST        /v1/log
//   POST        /notify  { eventId }  (trigger da BD, header x-wallet-notify-secret)
//                → push vazio pela APNs para cada iPhone com passes do evento.
import forge from "npm:node-forge@1.3.1";
import { zipSync, strToU8 } from "npm:fflate@0.8.2";
import { ICON_29, ICON_58, ICON_87, LOGO_1X, LOGO_2X, LOGO_3X, WWDR_CERT } from "./assets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PASS_TYPE_ID = Deno.env.get("WALLET_PASS_TYPE_ID") ?? "";
const TEAM_ID = Deno.env.get("APPLE_TEAM_ID") ?? "";
const CERT_P12_B64 = Deno.env.get("WALLET_CERT_P12") ?? "";
const CERT_PASSWORD = Deno.env.get("WALLET_CERT_PASSWORD") ?? "";
const WALLET_AUTH_SECRET = Deno.env.get("WALLET_AUTH_SECRET") ?? SERVICE_ROLE_KEY;
const NOTIFY_SECRET = Deno.env.get("WALLET_NOTIFY_SECRET") ?? "";
const WEB_SERVICE_URL = `${SUPABASE_URL}/functions/v1/wallet-pass`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ——— Tokens HMAC de curta duração (o GET é público, o token é a autenticação)

const encoder = new TextEncoder();

async function hmac(data: string, secret: string = SERVICE_ROLE_KEY): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

/** Token de autenticação do passe (fixo por bilhete; o iPhone envia-o como "ApplePass <token>"). */
function passAuthToken(serial: string): Promise<string> {
  return hmac(`wallet-auth:${serial}`, WALLET_AUTH_SECRET);
}

async function checkPassAuth(req: Request, serial: string): Promise<boolean> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("ApplePass ")) return false;
  return header.slice("ApplePass ".length).trim() === (await passAuthToken(serial));
}

// ——— Certificado do Pass Type ID (assinatura e APNs)

let cachedIdentity: { cert: forge.pki.Certificate; key: forge.pki.PrivateKey } | null = null;

function passIdentity() {
  if (cachedIdentity) return cachedIdentity;
  const p12Der = forge.util.binary.base64.decode(CERT_P12_B64);
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Der), false);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, true, CERT_PASSWORD);
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0].cert!;
  const key = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0].key!;
  cachedIdentity = { cert, key };
  return cachedIdentity;
}

// ——— Assinatura PKCS#7 do manifesto (node-forge)

function signManifest(manifestJson: string): Uint8Array {
  const { cert: signerCert, key: signerKey } = passIdentity();

  const wwdrAsn1 = forge.asn1.fromDer(forge.util.createBuffer(forge.util.binary.base64.decode(WWDR_CERT)), false);
  const wwdrCert = forge.pki.certificateFromAsn1(wwdrAsn1);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestJson);
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key: signerKey,
    certificate: signerCert,
    // O iOS exige atributos assinados (contentType, messageDigest e signingTime);
    // sem eles o Wallet rejeita o passe em silêncio.
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i) & 0xff;
  return out;
}

async function sha1Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ——— Dados (service role; o pedido já está autenticado)

interface TicketData {
  id: string;
  user_id: string;
  quantity: number;
  price: number;
  qr_code: string | null;
  event_id: string;
  ticket_type_id: string | null;
}

async function fetchTicket(ticketId: string, userId?: string): Promise<TicketData | null> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/tickets`);
  url.searchParams.set("id", `eq.${ticketId}`);
  if (userId) url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("select", "id,user_id,quantity,price,qr_code,event_id,ticket_type_id");
  const res = await fetch(url, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

interface EventData {
  title: string;
  venue: string | null;
  address: string | null;
  date: string;
  end_date: string | null;
  ticket_types: unknown;
  updated_at: string;
}

async function fetchEvent(eventId: string): Promise<EventData | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=title,venue_name,venue_address,venue_city,date,end_date,ticket_types,wallet_updated_at`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) {
    console.error("wallet-pass fetchEvent:", res.status, await res.text());
    return null;
  }
  const rows = await res.json();
  const e = rows[0];
  if (!e) return null;
  const venueName = (e.venue_name ?? "").trim();
  const city = (e.venue_city ?? "").trim();
  const venue = venueName && city && venueName.toLowerCase() !== city.toLowerCase()
    ? `${venueName}, ${city}`
    : venueName || city || null;
  return {
    title: e.title,
    venue,
    address: (e.venue_address ?? "").trim() || null,
    date: e.date,
    end_date: e.end_date,
    ticket_types: e.ticket_types,
    updated_at: e.wallet_updated_at ?? new Date().toISOString(),
  };
}

/** Os tipos de bilhete estão guardados em events.ticket_types (JSON). */
function ticketTypeName(ticketTypes: unknown, typeId: string | null): string | null {
  if (!typeId) return null;
  let list: unknown = ticketTypes;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch { return null; }
  }
  if (!Array.isArray(list)) return null;
  const found = list.find((t: { id?: unknown }) => String(t?.id) === String(typeId)) as { name?: string } | undefined;
  return found?.name ?? null;
}

async function fetchHolderName(userId: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  const meta = u?.user_metadata ?? {};
  return meta.name || meta.full_name || u?.email || null;
}

// ——— pass.json

function buildPassJson(ticket: TicketData, event: EventData, typeName: string, holderName: string, authToken: string): string {
  const eventDate = new Date(event.date);
  const endDate = event.end_date ? new Date(event.end_date) : new Date(eventDate.getTime() + 24 * 3600 * 1000);
  const when = eventDate.toLocaleString("pt-PT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
  });
  const where = event.venue || event.address || "A confirmar";
  const barcodeMessage = ticket.qr_code || ticket.id;

  return JSON.stringify({
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "Lyven",
    description: `Bilhete — ${event.title}`.slice(0, 120),
    serialNumber: ticket.id,
    webServiceURL: WEB_SERVICE_URL,
    authenticationToken: authToken,
    sharingProhibited: true,
    // Cores da marca: turquesa do logotipo (#0099A8) com texto branco
    backgroundColor: "rgb(0, 153, 168)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(204, 240, 243)",
    logoText: "LYVEN",
    relevantDate: eventDate.toISOString(),
    expirationDate: new Date(endDate.getTime() + 6 * 3600 * 1000).toISOString(),
    eventTicket: {
      primaryFields: [
        { key: "event", label: "EVENTO", value: event.title, changeMessage: "Evento atualizado: %@" },
      ],
      secondaryFields: [
        { key: "when", label: "DATA", value: when, changeMessage: "Nova data: %@" },
        { key: "where", label: "LOCAL", value: where, changeMessage: "Novo local: %@" },
      ],
      auxiliaryFields: [
        { key: "ticket", label: "BILHETE", value: typeName },
        { key: "qty", label: "QUANTIDADE", value: String(ticket.quantity) },
      ],
      backFields: [
        { key: "holder", label: "Titular", value: holderName },
        { key: "order", label: "Nº do bilhete", value: ticket.id },
        { key: "price", label: "Preço pago", value: ticket.price > 0 ? `€${Number(ticket.price).toFixed(2)}` : "Grátis" },
        { key: "terms", label: "Notas", value: "Apresente este bilhete na entrada do evento. Cada bilhete é pessoal e intransmissível. Apoio: info@lyven.pt · +351 964 927 026" },
      ],
    },
    barcodes: [{
      format: "PKBarcodeFormatQR",
      message: barcodeMessage,
      messageEncoding: "iso-8859-1",
    }],
    barcode: {
      format: "PKBarcodeFormatQR",
      message: barcodeMessage,
      messageEncoding: "iso-8859-1",
    },
  });
}

// ——— Construção do .pkpass

function b64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function buildPkpass(passJson: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "pass.json": strToU8(passJson),
    "icon.png": b64ToU8(ICON_29),
    "icon@2x.png": b64ToU8(ICON_58),
    "icon@3x.png": b64ToU8(ICON_87),
    "logo.png": b64ToU8(LOGO_1X),
    "logo@2x.png": b64ToU8(LOGO_2X),
    "logo@3x.png": b64ToU8(LOGO_3X),
  };

  const manifest: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    manifest[name] = await sha1Hex(data);
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  files["signature"] = signManifest(JSON.stringify(manifest));

  return zipSync(files, { level: 0 });
}

/** Gera o .pkpass completo de um bilhete (dados atuais da BD). */
async function passForTicket(ticket: TicketData): Promise<{ pkpass: Uint8Array; updatedAt: Date } | null> {
  const [event, holder, authToken] = await Promise.all([
    fetchEvent(ticket.event_id),
    fetchHolderName(ticket.user_id),
    passAuthToken(ticket.id),
  ]);
  if (!event) return null;
  const typeName = ticketTypeName(event.ticket_types, ticket.ticket_type_id);
  const passJson = buildPassJson(ticket, event, typeName ?? "Geral", holder ?? "Titular Lyven", authToken);
  return { pkpass: await buildPkpass(passJson), updatedAt: new Date(event.updated_at) };
}

function pkpassResponse(pkpass: Uint8Array, updatedAt: Date): Response {
  return new Response(pkpass, {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      // "inline" é essencial: com "attachment" o Safari só descarrega o ficheiro e
      // nunca mostra a antevisão do passe com o botão "Adicionar à Apple Wallet".
      "Content-Disposition": 'inline; filename="bilhete-lyven.pkpass"',
      "Last-Modified": updatedAt.toUTCString(),
      ...CORS_HEADERS,
    },
  });
}

// ——— Base de dados (service role)

const SR_HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: SR_HEADERS,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return await res.json() as T;
}

// ——— APNs (push vazio pede ao iPhone para descarregar o passe atualizado)

let apnsClient: Deno.HttpClient | null = null;

function getApnsClient(): Deno.HttpClient {
  if (apnsClient) return apnsClient;
  const { cert, key } = passIdentity();
  apnsClient = Deno.createHttpClient({
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(key),
  });
  return apnsClient;
}

async function sendPassPush(pushToken: string): Promise<{ status: number; reason?: string }> {
  const res = await fetch(`https://api.push.apple.com/3/device/${pushToken}`, {
    method: "POST",
    client: getApnsClient(),
    headers: { "apns-topic": PASS_TYPE_ID, "apns-push-type": "background", "apns-priority": "5" },
    body: "{}",
  });
  let reason: string | undefined;
  if (res.status !== 200) {
    try { reason = (await res.json())?.reason; } catch { /* sem corpo */ }
  } else {
    await res.body?.cancel();
  }
  return { status: res.status, reason };
}

async function notifyEvent(eventId: string) {
  const rows = await rpc<{ push_token: string; device_library_id: string }[]>("wallet_event_push_tokens", { p_event_id: eventId });
  const tokens = [...new Set(rows.map((r) => r.push_token))];
  const results = await Promise.all(tokens.map(async (token) => {
    try {
      const r = await sendPassPush(token);
      // 410: o passe foi removido do iPhone → apagar registo.
      if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") {
        await fetch(`${SUPABASE_URL}/rest/v1/wallet_registrations?push_token=eq.${encodeURIComponent(token)}`, {
          method: "DELETE", headers: SR_HEADERS,
        });
      }
      return r;
    } catch (err) {
      console.error("APNs error:", err);
      return { status: 0, reason: String((err as Error)?.message ?? err) };
    }
  }));
  return { devices: tokens.length, sent: results.filter((r) => r.status === 200).length, results };
}

// ——— Web service da Apple Wallet

async function handleWebService(req: Request, path: string): Promise<Response> {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent); // ["v1", ...]
  const { method } = req;

  // POST /v1/log
  if (parts[1] === "log" && method === "POST") {
    try { console.log("Wallet log:", JSON.stringify(await req.json())); } catch { /* ignorar */ }
    return new Response(null, { status: 200 });
  }

  // /v1/devices/{device}/registrations/{passType}[/{serial}]
  if (parts[1] === "devices" && parts[3] === "registrations") {
    const device = parts[2];
    const passType = parts[4];
    const serial = parts[5];
    if (passType !== PASS_TYPE_ID) return new Response(null, { status: 404 });

    if (!serial && method === "GET") {
      const sinceRaw = new URL(req.url).searchParams.get("passesUpdatedSince");
      const since = sinceRaw && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : null;
      const rows = await rpc<{ serial_number: string; updated_ms: number }[]>("wallet_updated_serials", {
        p_device: device, p_pass_type: passType, p_since_ms: since,
      });
      if (!rows.length) return new Response(null, { status: 204 });
      const last = Math.max(...rows.map((r) => Number(r.updated_ms)));
      return json({ serialNumbers: rows.map((r) => r.serial_number), lastUpdated: String(last) });
    }

    if (serial && (method === "POST" || method === "DELETE")) {
      if (!(await checkPassAuth(req, serial))) return new Response(null, { status: 401 });
      const filter = `device_library_id=eq.${encodeURIComponent(device)}&pass_type_id=eq.${encodeURIComponent(passType)}&serial_number=eq.${encodeURIComponent(serial)}`;

      if (method === "DELETE") {
        await fetch(`${SUPABASE_URL}/rest/v1/wallet_registrations?${filter}`, { method: "DELETE", headers: SR_HEADERS });
        return new Response(null, { status: 200 });
      }

      let pushToken = "";
      try { pushToken = (await req.json())?.pushToken ?? ""; } catch { /* sem corpo */ }
      if (!pushToken) return new Response(null, { status: 400 });

      const existing = await fetch(`${SUPABASE_URL}/rest/v1/wallet_registrations?${filter}&select=push_token`, { headers: SR_HEADERS });
      const rows = existing.ok ? await existing.json() : [];
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wallet_registrations?on_conflict=device_library_id,pass_type_id,serial_number`, {
        method: "POST",
        headers: { ...SR_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ device_library_id: device, pass_type_id: passType, serial_number: serial, push_token: pushToken }),
      });
      if (!res.ok) {
        console.error("wallet register:", res.status, await res.text());
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: rows.length ? 200 : 201 });
    }
  }

  // GET /v1/passes/{passType}/{serial}
  if (parts[1] === "passes" && method === "GET") {
    const passType = parts[2];
    const serial = parts[3];
    if (passType !== PASS_TYPE_ID || !serial) return new Response(null, { status: 404 });
    if (!(await checkPassAuth(req, serial))) return new Response(null, { status: 401 });

    const ticket = await fetchTicket(serial);
    if (!ticket) return new Response(null, { status: 404 });
    const built = await passForTicket(ticket);
    if (!built) return new Response(null, { status: 404 });

    const ims = req.headers.get("If-Modified-Since");
    if (ims) {
      const since = new Date(ims).getTime();
      // Last-Modified tem precisão de segundos
      if (!Number.isNaN(since) && Math.floor(built.updatedAt.getTime() / 1000) * 1000 <= since) {
        return new Response(null, { status: 304 });
      }
    }
    return pkpassResponse(built.pkpass, built.updatedAt);
  }

  return new Response(null, { status: 404 });
}

// ——— Handler

Deno.serve(async (req: Request) => {
  const { method } = req;
  if (method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const pathname = new URL(req.url).pathname;

  // Web service da Apple Wallet (…/wallet-pass/v1/…)
  const wsIndex = pathname.indexOf("/v1/");
  if (wsIndex !== -1) {
    try {
      return await handleWebService(req, pathname.slice(wsIndex));
    } catch (err) {
      console.error("wallet web service error:", err);
      return new Response(null, { status: 500 });
    }
  }

  // Aviso da BD: um evento mudou → push para os iPhones com passes desse evento.
  if (pathname.endsWith("/notify") && method === "POST") {
    if (!NOTIFY_SECRET || req.headers.get("x-wallet-notify-secret") !== NOTIFY_SECRET) {
      return json({ error: "Não autorizado" }, 401);
    }
    try {
      const { eventId } = await req.json();
      if (!eventId) return json({ error: "Falta o eventId" }, 400);
      const result = await notifyEvent(String(eventId));
      console.log("wallet notify:", eventId, JSON.stringify(result));
      return json(result);
    } catch (err) {
      console.error("wallet notify error:", err);
      return json({ error: String((err as Error)?.message ?? err) }, 500);
    }
  }

  if (method === "POST") {
    try {
      const auth = req.headers.get("Authorization") ?? "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: auth, apikey: SERVICE_ROLE_KEY },
      });
      if (!userRes.ok) return json({ error: "Sessão inválida" }, 401);
      const { id: userId } = await userRes.json();

      const { ticketId } = await req.json();
      if (!ticketId) return json({ error: "Falta o ticketId" }, 400);

      const ticket = await fetchTicket(ticketId, userId);
      if (!ticket) return json({ error: "Bilhete não encontrado" }, 404);

      const exp = Date.now() + 10 * 60 * 1000;
      const payload = b64url(JSON.stringify({ t: ticketId, u: userId, e: exp }));
      const token = `${payload}.${await hmac(payload)}`;

      return json({
        url: `${SUPABASE_URL}/functions/v1/wallet-pass?token=${token}`,
      });
    } catch (err) {
      console.error("wallet-pass POST error:", err);
      return json({ error: "Erro ao gerar o passe" }, 500);
    }
  }

  if (method === "GET") {
    try {
      const token = new URL(req.url).searchParams.get("token");
      if (!token || !token.includes(".")) return json({ error: "Token inválido" }, 401);

      const [payload, sig] = token.split(".");
      if ((await hmac(payload)) !== sig) return json({ error: "Token inválido" }, 401);

      const { t: ticketId, e: exp } = JSON.parse(unb64url(payload));
      if (Date.now() > exp) return json({ error: "Token expirado — volte à app e tente novamente" }, 401);

      const ticket = await fetchTicket(ticketId);
      if (!ticket) return json({ error: "Bilhete não encontrado" }, 404);

      const built = await passForTicket(ticket);
      if (!built) return json({ error: "Evento não encontrado" }, 404);
      return pkpassResponse(built.pkpass, built.updatedAt);
    } catch (err) {
      console.error("wallet-pass GET error:", err);
      return json({ error: "Erro ao gerar o passe", detail: String((err as Error)?.message ?? err) }, 500);
    }
  }

  return json({ error: "Método não suportado" }, 405);
});
