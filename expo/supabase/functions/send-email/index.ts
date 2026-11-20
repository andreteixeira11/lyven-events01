import { Resend } from "https://esm.sh/resend@6.9.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Lyven <noreply@lyven.pt>";

const resend = new Resend(RESEND_API_KEY);

const ADMIN_EMAIL = "info@lyven.pt";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const SERVICE_HEADERS = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Descobre o destinatário dos bilhetes de forma segura:
 * - chamada interna (webhook) com a service role: confia no userId enviado;
 * - chamada da app: valida o token do utilizador e usa o email da própria conta.
 */
async function resolveTicketOwner(req: Request, body: EmailRequest): Promise<{ userId: string; email: string; name: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;

  // O gateway do Supabase já validou a assinatura do JWT (verify_jwt), por isso
  // basta ler o papel do token para reconhecer chamadas internas.
  let role = "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    role = payload?.role ?? "";
  } catch {
    role = "";
  }
  const isService = token === SERVICE_ROLE_KEY || role === "service_role";

  if (isService && body.userId) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(body.userId)}`, { headers: SERVICE_HEADERS });
    if (!res.ok) return null;
    const u = await res.json();
    return { userId: u.id, email: u.email ?? "", name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? "" };
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY || SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  const u = await res.json();
  if (!u?.id) return null;
  return { userId: u.id, email: u.email ?? "", name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? "" };
}

async function buildTicketsEmail(ownerId: string, ticketIds: string[], name: string): Promise<{ subject: string; html: string } | { error: string }> {
  const ids = ticketIds.filter((id) => typeof id === "string" && id.length > 0).slice(0, 50);
  if (ids.length === 0) return { error: "Nenhum bilhete indicado." };

  const inList = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const ticketsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tickets?id=in.(${encodeURIComponent(inList)})&user_id=eq.${encodeURIComponent(ownerId)}&select=id,event_id,ticket_type_id,quantity,price,qr_code,purchase_date`,
    { headers: SERVICE_HEADERS },
  );
  const tickets = await ticketsRes.json();
  if (!Array.isArray(tickets) || tickets.length === 0) return { error: "Bilhetes não encontrados nesta conta." };

  const eventIds = [...new Set(tickets.map((t: any) => t.event_id))];
  const eventsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/events?id=in.(${encodeURIComponent(eventIds.map((id) => `"${id}"`).join(","))})&select=id,title,date,venue_name,venue_address,venue_city,image,ticket_types`,
    { headers: SERVICE_HEADERS },
  );
  const events = await eventsRes.json();
  const eventById = new Map<string, any>((Array.isArray(events) ? events : []).map((e: any) => [e.id, e]));

  const first = eventById.get(tickets[0].event_id);
  const title = first?.title ?? "Evento";

  const blocks = tickets.map((t: any) => {
    const ev = eventById.get(t.event_id) ?? {};
    let types: any[] = [];
    try {
      types = typeof ev.ticket_types === "string" ? JSON.parse(ev.ticket_types) : ev.ticket_types ?? [];
    } catch {
      types = [];
    }
    const typeName = types.find((tt: any) => tt.id === t.ticket_type_id)?.name ?? "Bilhete";
    const date = ev.date ? new Date(ev.date) : null;
    const dateText = date && !isNaN(date.getTime())
      ? date.toLocaleString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
      : "";
    const place = [ev.venue_name, ev.venue_city].filter(Boolean).join(", ");
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=8&data=${encodeURIComponent(t.qr_code ?? "")}`;
    const qty = Number(t.quantity) > 1 ? ` · ${t.quantity} entradas` : "";
    return `
      <div style="border:1px solid #e6f6f7;border-radius:14px;padding:20px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#1a1a2e;">${escapeHtml(ev.title ?? "Evento")}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#0099a8;font-weight:600;">${escapeHtml(typeName)}${qty}</p>
        ${dateText ? `<p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${escapeHtml(dateText)}</p>` : ""}
        ${place ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${escapeHtml(place)}</p>` : ""}
        <img src="${qrUrl}" width="220" height="220" alt="Código QR do bilhete" style="display:block;margin:0 auto 12px;border-radius:8px;" />
        <p style="margin:0;font-size:11px;color:#9ca3af;word-break:break-all;">${escapeHtml(t.qr_code)}</p>
      </div>`;
  }).join("");

  const subject = tickets.length > 1 ? `Os teus bilhetes — ${title}` : `O teu bilhete — ${title}`;
  const html = emailWrapper(tickets.length > 1 ? "Os teus bilhetes" : "O teu bilhete", `
    <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Olá${name ? `, ${escapeHtml(name)}` : ""}!</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
      Aqui ${tickets.length > 1 ? "estão os teus bilhetes" : "está o teu bilhete"}. Apresenta o código QR à entrada do evento — também o encontras sempre na app Lyven, em "Os meus bilhetes".
    </p>
    ${blocks}
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center;">
      Cada código só pode ser usado uma vez. Não partilhes este email.
    </p>`);
  return { subject, html };
}

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

function emailWrapper(subject: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,153,168,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg, #0099a8 0%, #007A87 100%);padding:36px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:1px;">Lyven</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:400;">${subject}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6f6f7;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Lyven. Todos os direitos reservados.</p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">Pode gerir as suas preferências de email nas definições da app.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface EmailRequest {
  type: string;
  // generic
  email?: string;
  name?: string;
  subject?: string;
  content?: string;
  // verification code
  code?: string;
  // new promoter notification
  promoterName?: string;
  promoterEmail?: string;
  // new event notification
  eventTitle?: string;
  eventDate?: string;
  venueName?: string;
  category?: string;
  // new ad notification
  adTitle?: string;
  adType?: string;
  budget?: number;
  // email preferences
  preferences?: Record<string, boolean>;
  // tickets
  ticketIds?: string[];
  userId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body: EmailRequest = await req.json();
    let to = body.email ?? "";
    let subject = "";
    let html = "";

    switch (body.type) {
      case "sendVerificationCode": {
        to = body.email!;
        subject = "Código de Verificação - Lyven";
        html = emailWrapper("Verificação de Email", `
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Olá, ${body.name}!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Usa o código abaixo para verificar o teu email e concluir o registo na Lyven.
          </p>
          <div style="background-color:#f0fafb;border:2px dashed #0099a8;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
            <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#007A87;">${body.code}</span>
          </div>
          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-align:center;">
            Este código expira em <strong style="color:#0099a8;">5 minutos</strong>.
          </p>
          <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
            Se não solicitaste este código, podes ignorar este email.
          </p>`);
        break;
      }

      case "sendNewPromoterNotification": {
        to = ADMIN_EMAIL;
        subject = "Novo Promotor Registado - Aguarda Aprovação";
        html = emailWrapper("Novo Promotor Registado", `
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Novo registo de promotor!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Um novo promotor registou-se na plataforma e aguarda a sua aprovação.
          </p>
          <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Nome:</strong> ${body.promoterName}</p>
            <p style="margin:0;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Email:</strong> ${body.promoterEmail}</p>
          </div>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Aceda ao painel de administração para aprovar ou rejeitar este promotor.
          </p>`);
        break;
      }

      case "sendNewEventNotification": {
        to = ADMIN_EMAIL;
        subject = "Novo Evento Criado";
        html = emailWrapper("Novo Evento Criado", `
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Novo evento criado!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Um promotor criou um novo evento na plataforma.
          </p>
          <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Evento:</strong> ${body.eventTitle}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Promotor:</strong> ${body.promoterName}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Email:</strong> ${body.promoterEmail}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Data:</strong> ${body.eventDate}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Local:</strong> ${body.venueName}</p>
            <p style="margin:0;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Categoria:</strong> ${body.category}</p>
          </div>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Aceda ao painel de administração para ver os detalhes deste evento.
          </p>`);
        break;
      }

      case "sendNewAdNotification": {
        to = ADMIN_EMAIL;
        subject = "Novo Anúncio Criado - Aguarda Aprovação";
        html = emailWrapper("Novo Anúncio Aguarda Aprovação", `
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Novo anúncio submetido!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Um promotor submeteu um novo anúncio que aguarda a sua aprovação.
          </p>
          <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Anúncio:</strong> ${body.adTitle}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Promotor:</strong> ${body.promoterName}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Tipo:</strong> ${body.adType}</p>
            <p style="margin:0;font-size:14px;color:#6b7280;"><strong style="color:#1a1a2e;">Orçamento:</strong> €${body.budget}</p>
          </div>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Aceda ao painel de administração para aprovar ou rejeitar este anúncio.
          </p>`);
        break;
      }

      case "sendPromoterApprovalEmail": {
        to = body.promoterEmail!;
        subject = "Conta Aprovada - Lyven";
        html = emailWrapper("Conta Aprovada", `
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Parabéns, ${body.promoterName}!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            A sua conta de promotor foi aprovada pela <strong style="color:#0099a8;">Lyven</strong>! 🎉
          </p>
          <div style="background-color:#f0fafb;border:1px solid #e6f6f7;border-radius:12px;padding:20px;margin:0 0 24px;">
            <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1a2e;">O que pode fazer agora:</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">✅ Publicar eventos na plataforma</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">✅ Gerir bilhetes e vendas</p>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">✅ Acompanhar estatísticas</p>
            <p style="margin:0;font-size:14px;color:#6b7280;">✅ Interagir com seguidores</p>
          </div>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Inicie sessão na app Lyven como promotor para começar a criar os seus eventos.
          </p>`);
        break;
      }

      case "sendNotification": {
        to = body.email!;
        subject = body.subject ?? "Notificação - Lyven";
        html = emailWrapper(subject, `
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a2e;">Olá, ${body.name}!</p>
          <div style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            ${body.content}
          </div>`);
        break;
      }

      case "sendTickets": {
        const owner = await resolveTicketOwner(req, body);
        if (!owner) return json({ error: "Sessão inválida. Inicia sessão novamente." }, 401);
        if (!owner.email) return json({ error: "A tua conta não tem email associado." }, 400);
        const built = await buildTicketsEmail(owner.userId, body.ticketIds ?? [], owner.name || body.name || "");
        if ("error" in built) return json({ error: built.error }, 404);
        to = owner.email;
        subject = built.subject;
        html = built.html;
        break;
      }

      case "savePreferences": {
        // Only persists to DB if needed; currently just acknowledge
        return json({ success: true });
      }

      default:
        return json({ error: "Unknown email type: " + body.type }, 400);
    }

    if (!to) {
      return json({ error: "Missing recipient email" }, 400);
    }

    if (!RESEND_API_KEY) {
      console.error("[send-email] RESEND_API_KEY is not configured");
      return json({ error: "Email service not configured (RESEND_API_KEY missing)" }, 500);
    }

    console.log(`[send-email] Sending email to ${to} from ${FROM_EMAIL} via Resend...`);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[send-email] Resend error:", JSON.stringify(error));
      return json({ error: `Failed to send email: ${error?.message || JSON.stringify(error)}` }, 500);
    }

    console.log("[send-email] Email sent successfully, id:", data?.id);
    return json({ success: true, emailId: data?.id, to });
  } catch (err: any) {
    console.error("[send-email] Error:", err?.message || err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
