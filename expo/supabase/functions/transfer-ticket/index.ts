// Transferência de bilhetes para outra conta (por email).
// POST { ticketIds: string[], toEmail: string } com Authorization do utilizador.
// Se o email não tiver conta, o bilhete fica pendente para esse email e o
// destinatário recebe o QR por email; ao registar-se, o bilhete passa para a conta.
// O servidor valida a propriedade dos bilhetes, muda o dono e envia email
// ao destinatário — o cliente nunca escreve bilhetes diretamente.
import { Resend } from "https://esm.sh/resend@6.9.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Lyven <noreply@lyven.pt>";

const resend = new Resend(RESEND_API_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface TicketRow {
  id: string;
  user_id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  qr_code: string;
  is_used: boolean;
  pending_transfer_email: string | null;
}

function serviceHeaders() {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inList(ids: string[]): string {
  return encodeURIComponent(ids.map((id) => `"${id.replace(/"/g, "")}"`).join(","));
}

async function fetchTickets(ticketIds: string[]): Promise<TicketRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tickets?select=id,user_id,event_id,ticket_type_id,quantity,qr_code,is_used,pending_transfer_email&id=in.(${inList(ticketIds)})`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

async function findUserByEmail(email: string): Promise<{ id: string; name: string | null } | null> {
  // eq (não ilike): "_" e "%" num email não podem apanhar outra conta
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,name,email&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function getUserName(userId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=name,email&id=eq.${encodeURIComponent(userId)}`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return "Um utilizador Lyven";
  const rows = await res.json();
  return rows[0]?.name || rows[0]?.email || "Um utilizador Lyven";
}

async function fetchEvents(eventIds: string[]): Promise<Map<string, any>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?id=in.(${inList(eventIds)})&select=id,title,date,venue_name,venue_city,ticket_types`,
    { headers: serviceHeaders() }
  );
  const rows = res.ok ? await res.json() : [];
  return new Map((Array.isArray(rows) ? rows : []).map((e: any) => [e.id, e]));
}

function ticketBlock(t: TicketRow, ev: any): string {
  let types: any[] = [];
  try {
    types = typeof ev?.ticket_types === "string" ? JSON.parse(ev.ticket_types) : ev?.ticket_types ?? [];
  } catch {
    types = [];
  }
  const typeName = types.find((tt: any) => tt.id === t.ticket_type_id)?.name ?? "Bilhete";
  const date = ev?.date ? new Date(ev.date) : null;
  const dateText = date && !isNaN(date.getTime())
    ? date.toLocaleString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
    : "";
  const place = [ev?.venue_name, ev?.venue_city].filter(Boolean).join(", ");
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=8&data=${encodeURIComponent(t.qr_code ?? "")}`;
  const qty = Number(t.quantity) > 1 ? ` · ${t.quantity} entradas` : "";
  return `
    <div style="border:1px solid #e6f6f7;border-radius:14px;padding:20px;margin:0 0 20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#1a1a2e;">${escapeHtml(ev?.title ?? "Evento")}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#0099a8;font-weight:600;">${escapeHtml(typeName)}${qty}</p>
      ${dateText ? `<p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${escapeHtml(dateText)}</p>` : ""}
      ${place ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${escapeHtml(place)}</p>` : ""}
      <img src="${qrUrl}" width="220" height="220" alt="Código QR do bilhete" style="display:block;margin:0 auto 12px;border-radius:8px;" />
      <p style="margin:0;font-size:11px;color:#9ca3af;word-break:break-all;">${escapeHtml(t.qr_code)}</p>
    </div>`;
}

function emailHtml(senderName: string, blocks: string, count: number, hasAccount: boolean): string {
  const appNote = hasAccount
    ? `Também ${count > 1 ? "os" : "o"} encontras na app Lyven, em "Os meus bilhetes".`
    : `Ainda não tens conta na Lyven? Cria uma com <strong style="color:#1a1a2e;">este mesmo email</strong> e ${count > 1 ? "os bilhetes aparecem" : "o bilhete aparece"} automaticamente na app.`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
      <tr><td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Recebeste ${count > 1 ? "bilhetes" : "um bilhete"}</p>
      </td></tr>
      <tr><td style="padding:32px 24px;">
        <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Olá!</p>
        <p style="margin:0 0 12px;font-size:15px;color:#6b7280;line-height:1.6;">
          <strong style="color:#1a1a2e;">${escapeHtml(senderName)}</strong> transferiu-te
          <strong style="color:#1a1a2e;">${count} bilhete${count > 1 ? "s" : ""}</strong>.
          Apresenta o código QR à entrada do evento.
        </p>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">${appNote}</p>
        ${blocks}
        <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center;">
          Cada código só pode ser usado uma vez. Não partilhes este email.<br/>Apoio: info@lyven.pt · +351 964 927 026
        </p>
      </td></tr>
      <tr><td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: SERVICE_ROLE_KEY },
    });
    if (!userRes.ok) return json({ error: "Sessão inválida" }, 401);
    const { id: userId, email: senderEmail } = await userRes.json();

    const { ticketIds, toEmail } = await req.json();
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return json({ error: "Nenhum bilhete selecionado" }, 400);
    }
    const email = String(toEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Email inválido" }, 400);
    }
    if (senderEmail && email === String(senderEmail).toLowerCase()) {
      return json({ error: "Não podes transferir bilhetes para ti próprio" }, 400);
    }

    // 1. Todos os bilhetes têm de pertencer ao utilizador e estar disponíveis
    const tickets = await fetchTickets(ticketIds);
    if (tickets.length !== ticketIds.length) {
      return json({ error: "Alguns bilhetes não foram encontrados" }, 404);
    }
    if (tickets.some((t) => t.user_id !== userId)) {
      return json({ error: "Só podes transferir bilhetes que são teus" }, 403);
    }
    if (tickets.some((t) => t.pending_transfer_email)) {
      return json({ error: "Este bilhete já foi transferido" }, 400);
    }
    if (tickets.some((t) => t.is_used)) {
      return json({ error: "Não é possível transferir bilhetes já usados" }, 400);
    }

    // 2. Com conta: o bilhete muda logo de dono.
    //    Sem conta: fica pendente para o email e passa para a conta quando a pessoa se registar.
    const target = await findUserByEmail(email);
    if (target && target.id === userId) {
      return json({ error: "Não podes transferir bilhetes para a tua própria conta" }, 400);
    }
    const patch = target
      ? { user_id: target.id, transferred_from: userId, pending_transfer_email: null }
      : { pending_transfer_email: email, transferred_from: userId };

    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tickets?id=in.(${inList(ticketIds)})&user_id=eq.${encodeURIComponent(userId)}&pending_transfer_email=is.null`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(patch),
      }
    );
    if (!patchRes.ok) {
      console.error("transfer-ticket: patch falhou", patchRes.status, await patchRes.text());
      return json({ error: "Não foi possível transferir os bilhetes. Tenta novamente." }, 500);
    }
    const updated: TicketRow[] = await patchRes.json();
    if (updated.length !== ticketIds.length) {
      return json({ error: "A transferência falhou — verifica os bilhetes e tenta novamente" }, 500);
    }

    // 3. Email ao destinatário com os códigos QR
    let emailSent = false;
    if (RESEND_API_KEY) {
      try {
        const [senderName, events] = await Promise.all([
          getUserName(userId),
          fetchEvents([...new Set(tickets.map((t) => t.event_id))]),
        ]);
        const blocks = tickets.map((t) => ticketBlock(t, events.get(t.event_id))).join("");
        const title = events.get(tickets[0].event_id)?.title ?? "Lyven";
        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: tickets.length > 1 ? `Recebeste bilhetes — ${title}` : `Recebeste um bilhete — ${title}`,
          html: emailHtml(senderName, blocks, tickets.length, !!target),
        });
        if (error) console.error("transfer-ticket: resend", error);
        else emailSent = true;
      } catch (mailErr) {
        console.error("transfer-ticket: email falhou", mailErr);
      }
    }

    return json({ success: true, hasAccount: !!target, emailSent });
  } catch (err) {
    console.error("transfer-ticket error:", err);
    return json({ error: "Erro ao transferir os bilhetes" }, 500);
  }
});
