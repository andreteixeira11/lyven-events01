// Transferência de bilhetes para outra conta (por email).
// POST { ticketIds: string[], toEmail: string } com Authorization do utilizador.
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
}

async function serviceHeaders() {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
}

async function fetchTickets(ticketIds: string[]): Promise<TicketRow[]> {
  const ids = ticketIds.map((id) => `"${encodeURIComponent(id)}"`).join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tickets?select=id,user_id,event_id&id=in.(${ids})`,
    { headers: await serviceHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

async function findUserByEmail(email: string): Promise<{ id: string; name: string | null } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,name,email&email=ilike.${encodeURIComponent(email)}`,
    { headers: await serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function getUserName(userId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=name,email&id=eq.${encodeURIComponent(userId)}`,
    { headers: await serviceHeaders() }
  );
  if (!res.ok) return "Um utilizador Lyven";
  const rows = await res.json();
  return rows[0]?.name || rows[0]?.email || "Um utilizador Lyven";
}

async function getEventTitle(eventId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=title&id=eq.${encodeURIComponent(eventId)}`,
    { headers: await serviceHeaders() }
  );
  if (!res.ok) return "um evento";
  const rows = await res.json();
  return rows[0]?.title ?? "um evento";
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
    const { id: userId } = await userRes.json();

    const { ticketIds, toEmail } = await req.json();
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return json({ error: "Nenhum bilhete selecionado" }, 400);
    }
    const email = String(toEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Email inválido" }, 400);
    }

    // 1. Todos os bilhetes têm de pertencer ao utilizador autenticado
    const tickets = await fetchTickets(ticketIds);
    if (tickets.length !== ticketIds.length) {
      return json({ error: "Alguns bilhetes não foram encontrados" }, 404);
    }
    if (tickets.some((t) => t.user_id !== userId)) {
      return json({ error: "Só podes transferir bilhetes que são teus" }, 403);
    }

    // 2. O destinatário tem de ter conta na Lyven
    const target = await findUserByEmail(email);
    if (!target) {
      return json({ error: "Não existe nenhuma conta Lyven com esse email" }, 404);
    }
    if (target.id === userId) {
      return json({ error: "Não podes transferir bilhetes para a tua própria conta" }, 400);
    }

    // 3. Muda o dono dos bilhetes (com guarda extra de propriedade)
    const ids = ticketIds.map((id) => `"${encodeURIComponent(id)}"`).join(",");
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tickets?id=in.(${ids})&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          ...(await serviceHeaders()),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ user_id: target.id }),
      }
    );
    if (!patchRes.ok) {
      console.error("transfer-ticket: patch falhou", patchRes.status);
      return json({ error: "Não foi possível transferir os bilhetes. Tenta novamente." }, 500);
    }
    const updated: TicketRow[] = await patchRes.json();
    if (updated.length !== ticketIds.length) {
      return json({ error: "A transferência falhou — verifica os bilhetes e tenta novamente" }, 500);
    }

    // 4. Email ao destinatário
    if (RESEND_API_KEY) {
      try {
        const [senderName, eventTitle] = await Promise.all([
          getUserName(userId),
          getEventTitle(tickets[0].event_id),
        ]);
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: "Recebeste bilhete(s) na Lyven! 🎫",
          html: `
            <div style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h2 style="color:#1a1a2e;">Recebeste bilhete(s)! 🎫</h2>
              <p style="color:#6b7280;font-size:15px;line-height:1.6;">
                <strong style="color:#1a1a2e;">${senderName}</strong> transferiu-te
                <strong style="color:#1a1a2e;">${ticketIds.length} bilhete(s)</strong> para o evento
                <strong style="color:#1a1a2e;">${eventTitle}</strong>.
              </p>
              <p style="color:#6b7280;font-size:15px;line-height:1.6;">
                Entra na app Lyven para veres os teus bilhetes e o código QR de entrada.
              </p>
            </div>`,
        });
      } catch (mailErr) {
        // A transferência já aconteceu; o email é secundário
        console.error("transfer-ticket: email falhou", mailErr);
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("transfer-ticket error:", err);
    return json({ error: "Erro ao transferir os bilhetes" }, 500);
  }
});
