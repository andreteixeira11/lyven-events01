// Stripe Connect — liga a conta Stripe do promotor e paga-lhe as vendas
// diretamente; a Lyven fica com a taxa de serviço.
//
// POST { action: "start" | "status" | "payout" } com Authorization do utilizador.
// GET  ?return=1 — página simples para onde o onboarding do Stripe devolve.
//
// Modelo financeiro (documentado em docs.stripe.com/connect/separate-charges-and-transfers):
// o comprador paga bilhetes + taxa de serviço Lyven num só carregamento na
// plataforma; após o pagamento, transfere-se o valor dos bilhetes (sem a taxa)
// para a conta Express do promotor com source_transaction=payment (a
// transferência só executa quando os fundos do carregamento ficam disponíveis).
// A taxa de processamento do Stripe fica na plataforma, saída da taxa de serviço.
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

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

function restHeaders() {
  return { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" };
}

async function authUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: ANON_KEY || SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}

async function getProfile(userId: string): Promise<any | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/promoter_profiles?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: restHeaders() }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function patchProfile(userId: string, patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/promoter_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { ...restHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

/** Bilhetes pagos ainda não transferidos para o promotor, agrupados por sessão e evento. */
async function pendingGroups(userId: string): Promise<Array<{ eventId: string; sessionId: string; amountCents: number; ticketIds: string[] }>> {
  const url =
    `${SUPABASE_URL}/rest/v1/tickets?select=id,event_id,price,quantity,stripe_session_id` +
    `&stripe_transfer_id=is.null&price=gt.0&events!inner(promoter_id)=eq.${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers: restHeaders() });
  if (!res.ok) return [];
  const rows = await res.json();
  const map = new Map<string, { eventId: string; sessionId: string; amountCents: number; ticketIds: string[] }>();
  for (const t of rows as any[]) {
    const sessionId = t.stripe_session_id;
    if (!sessionId) continue; // bilhete gratuito ou fora do Stripe: nada a transferir
    const key = `${t.event_id}|${sessionId}`;
    const g = map.get(key) ?? { eventId: t.event_id, sessionId, amountCents: 0, ticketIds: [] };
    g.amountCents += Math.round(Number(t.price) * Number(t.quantity) * 100);
    g.ticketIds.push(t.id);
    map.set(key, g);
  }
  return [...map.values()];
}

/** ID do carregamento (charge) de uma sessão de checkout paga. */
async function chargeIdForSession(stripe: Stripe, sessionId: string): Promise<string | null> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session.payment_intent) return null;
    const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent));
    return typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
  } catch (err: any) {
    console.error("[stripe-connect] charge lookup falhou:", err?.message);
    return null;
  }
}

async function transferGroup(
  stripe: Stripe,
  g: { eventId: string; sessionId: string; amountCents: number; ticketIds: string[] },
  destination: string
): Promise<boolean> {
  try {
    const chargeId = await chargeIdForSession(stripe, g.sessionId);
    if (!chargeId) return false;
    const transfer = await stripe.transfers.create({
      amount: g.amountCents,
      currency: "eur",
      destination,
      source_transaction: chargeId,
      metadata: { eventId: g.eventId, sessionId: g.sessionId },
    });
    await fetch(
      `${SUPABASE_URL}/rest/v1/tickets?id=in.(${encodeURIComponent(g.ticketIds.map((id) => `"${id}"`).join(","))})&stripe_transfer_id=is.null`,
      {
        method: "PATCH",
        headers: { ...restHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({ stripe_transfer_id: transfer.id, transferred_at: new Date().toISOString() }),
      }
    );
    return true;
  } catch (err: any) {
    console.error("[stripe-connect] transfer falhou:", err?.message);
    return false;
  }
}

const RETURN_PAGE = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lyven</title></head>
<body style="margin:0;background:#f0fafb;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px 24px;">
<div style="font-size:26px;font-weight:700;letter-spacing:1px;color:#0099a8;margin-bottom:16px;">LYVEN</div>
<h1 style="font-size:19px;color:#1a1a2e;margin:0 0 8px;">Configuração guardada</h1>
<p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.6;">Podes fechar esta página e voltar à app Lyven para veres o estado da tua conta Stripe.</p>
</div></body></html>`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  // Página de retorno do onboarding (sem autenticação)
  if (req.method === "GET") {
    return new Response(RETURN_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
  if (!STRIPE_SECRET_KEY) return json({ error: "Stripe não está configurado." }, 503);

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });

  try {
    const user = await authUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    const profile = await getProfile(user.id);
    if (!profile) return json({ error: "Só promotores aprovados podem ligar uma conta Stripe." }, 403);

    let accountId: string | null = profile.stripe_account_id ?? null;
    let { action } = await req.json().catch(() => ({ action: "status" }));

    if (action === "start") {
      try {
        if (!accountId) {
          const account = await stripe.accounts.create({
            type: "express",
            email: user.email || undefined,
            metadata: { lyven_user_id: user.id },
          });
          accountId = account.id;
          await patchProfile(user.id, { stripe_account_id: accountId });
        }
        const link = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: `${SUPABASE_URL}/functions/v1/stripe-connect`,
          return_url: `${SUPABASE_URL}/functions/v1/stripe-connect`,
          type: "account_onboarding",
        });
        return json({ url: link.url, accountId });
      } catch (err: any) {
        console.error("[stripe-connect] start falhou:", err?.message);
        return json({ error: stripeStartError(err?.message) }, 502);
      }
    }

    if (action === "status") {
      const status = { connected: false, chargesEnabled: false, detailsSubmitted: false, pendingCents: 0, accountId: null as string | null };
      if (accountId) {
        try {
          const account = await stripe.accounts.retrieve(accountId);
          status.connected = true;
          status.chargesEnabled = account.charges_enabled ?? false;
          status.detailsSubmitted = account.details_submitted ?? false;
          await patchProfile(user.id, {
            stripe_charges_enabled: status.chargesEnabled,
            stripe_details_submitted: status.detailsSubmitted,
            stripe_payouts_enabled: account.payouts_enabled ?? false,
          });
        } catch (err: any) {
          console.error("[stripe-connect] status:", err?.message);
        }
      }
      const groups = await pendingGroups(user.id);
      status.pendingCents = groups.reduce((s, g) => s + g.amountCents, 0);
      status.accountId = accountId;
      return json(status);
    }

    if (action === "payout") {
      if (!accountId) return json({ error: "Primeiro liga a tua conta Stripe." }, 400);
      const account = await stripe.accounts.retrieve(accountId).catch(() => null);
      if (!account?.charges_enabled) {
        return json({ error: "A tua conta Stripe ainda não está pronta para receber transferências." }, 400);
      }
      const groups = await pendingGroups(user.id);
      let transferred = 0;
      let failed = 0;
      for (const g of groups.slice(0, 40)) {
        if (await transferGroup(stripe, g, accountId)) transferred++;
        else failed++;
      }
      return json({ transferred, failed, remainingCents: groups.slice(40).reduce((s, g) => s + g.amountCents, 0) });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err: any) {
    console.error("[stripe-connect] error:", err?.message);
    return json({ error: "Erro inesperado. Tenta novamente." }, 500);
  }
});

/** Mensagem de erro amigável para falhas do onboarding. */
function stripeStartError(message: string | undefined): string {
  if (!message) return "Não foi possível abrir o onboarding do Stripe. Tenta novamente.";
  if (message.includes("Connect has not been set up") || message.includes("not been activated")) {
    return "O Stripe Connect ainda não está ativado na conta Lyven. Ativa-o no painel do Stripe (secção Connect).";
  }
  return "Não foi possível abrir o onboarding do Stripe. Tenta novamente.";
}
