// Apple Wallet — gera o bilhete como passe .pkpass assinado.
// POST { ticketId } (Authorization do utilizador) → devolve URL do passe com
// token HMAC de curta duração (10 min).
// GET ?token=... → devolve o .pkpass (o iOS mostra "Adicionar à Apple Wallet").
import forge from "npm:node-forge@1.3.1";
import { zipSync, strToU8 } from "npm:fflate@0.8.2";
import { ICON_29, ICON_58, ICON_87, WWDR_CERT } from "./assets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PASS_TYPE_ID = Deno.env.get("WALLET_PASS_TYPE_ID") ?? "";
const TEAM_ID = Deno.env.get("APPLE_TEAM_ID") ?? "";
const CERT_P12_B64 = Deno.env.get("WALLET_CERT_P12") ?? "";
const CERT_PASSWORD = Deno.env.get("WALLET_CERT_PASSWORD") ?? "";

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

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SERVICE_ROLE_KEY),
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

// ——— Assinatura PKCS#7 do manifesto (node-forge)

function signManifest(manifestJson: string): Uint8Array {
  const p12Der = forge.util.binary.base64.decode(CERT_P12_B64);
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Der), false);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, true, CERT_PASSWORD);

  const signerCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert!;
  const signerKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0].key!;

  const wwdrAsn1 = forge.asn1.fromDer(forge.util.createBuffer(forge.util.binary.base64.decode(WWDR_CERT)), false);
  const wwdrCert = forge.pki.certificateFromAsn1(wwdrAsn1);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestJson);
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key: signerKey,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [],
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

async function fetchEvent(eventId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?id=eq.${eventId}&select=title,venue,address,date,end_date`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function fetchTicketType(ticketId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ticket_types?id=eq.${ticketId}&select=name`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.name ?? null;
}

// ——— pass.json

function buildPassJson(ticket: TicketData, event: { title: string; venue: string | null; address: string | null; date: string; end_date: string | null }, typeName: string, holderName: string): string {
  const eventDate = new Date(event.date);
  const endDate = event.end_date ? new Date(event.end_date) : new Date(eventDate.getTime() + 24 * 3600 * 1000);
  const when = eventDate.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
  const where = event.venue || event.address || "A confirmar";
  const barcodeMessage = ticket.qr_code || ticket.id;

  return JSON.stringify({
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "Lyven",
    description: `Bilhete — ${event.title}`.slice(0, 120),
    serialNumber: ticket.id,
    sharingProhibited: true,
    backgroundColor: "rgb(26, 26, 46)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(151, 158, 189)",
    logoText: "Lyven",
    relevantDate: eventDate.toISOString(),
    expirationDate: new Date(endDate.getTime() + 6 * 3600 * 1000).toISOString(),
    eventTicket: {
      primaryFields: [
        { key: "event", label: "EVENTO", value: event.title },
      ],
      secondaryFields: [
        { key: "when", label: "DATA", value: when },
        { key: "where", label: "LOCAL", value: where },
      ],
      auxiliaryFields: [
        { key: "ticket", label: "BILHETE", value: typeName },
        { key: "qty", label: "QUANTIDADE", value: String(ticket.quantity) },
      ],
      backFields: [
        { key: "holder", label: "Titular", value: holderName },
        { key: "order", label: "Nº do bilhete", value: ticket.id },
        { key: "price", label: "Preço pago", value: ticket.price > 0 ? `€${Number(ticket.price).toFixed(2)}` : "Grátis" },
        { key: "terms", label: "Notas", value: "Apresente este bilhete na entrada do evento. Cada bilhete é pessoal e intransmissível. Apoio: suporte@lyven.pt" },
      ],
    },
    barcode: {
      format: "PKBarcodeFormatQR",
      message: barcodeMessage,
      messageEncoding: "iso-8859-1",
      altText: barcodeMessage,
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
  };

  const manifest: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    manifest[name] = await sha1Hex(data);
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  files["signature"] = signManifest(JSON.stringify(manifest));

  return zipSync(files, { level: 0 });
}

// ——— Handler

Deno.serve(async (req: Request) => {
  const { method } = req;
  if (method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

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

      const [event, typeName] = await Promise.all([
        fetchEvent(ticket.event_id),
        ticket.ticket_type_id ? fetchTicketType(ticket.ticket_type_id) : Promise.resolve(null),
      ]);
      if (!event) return json({ error: "Evento não encontrado" }, 404);

      const passJson = buildPassJson(ticket, event, typeName ?? "Geral", "Titular Lyven");
      const pkpass = await buildPkpass(passJson);

      return new Response(pkpass, {
        headers: {
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": 'attachment; filename="bilhete-lyven.pkpass"',
          ...CORS_HEADERS,
        },
      });
    } catch (err) {
      console.error("wallet-pass GET error:", err);
      return json({ error: "Erro ao gerar o passe" }, 500);
    }
  }

  return json({ error: "Método não suportado" }, 405);
});
