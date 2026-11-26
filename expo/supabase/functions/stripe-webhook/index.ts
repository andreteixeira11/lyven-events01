// Stripe Webhook — confirma pagamentos e emite bilhetes.
// Verifica a assinatura do Stripe (STRIPE_WEBHOOK_SECRET) e, quando um
// checkout é concluído, cria os bilhetes na base de dados (com idempotência
// via tickets.stripe_session_id), marca lugares escolhidos e notifica o
// promotor. O cliente nunca cria bilhetes pagos — só este webhook o faz.
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
});

const REST_HEADERS = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates",
};

interface ValidatedItem {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  price: number;
  eventTitle: string;
  ticketTypeName: string;
  seatLabels: string[];
}

async function restInsert(table: string, rows: unknown[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: REST_HEADERS,
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`insert ${table}: ${res.status} ${text}`);
  }
  return res.json().catch(() => null);
}

/**
 * Transfere o valor dos bilhetes (sem a taxa de serviço) para a conta Stripe
 * Connect do promotor. source_transaction prende a transferência ao carregamento:
 * executa quando os fundos ficam disponíveis. Sem conta pronta, os bilhetes
 * ficam por transferir e o promotor recebe-os via "payout" (stripe-connect)
 * depois de ligar a conta. Falhas ficam registadas e são retentáveis aí.
 */
async function transferToPromoters(session: any, items: ValidatedItem[], ticketRows: any[]) {
  const paymentIntentId = session.payment_intent;
  if (!paymentIntentId) return;
  const pi = await stripe.paymentIntents.retrieve(String(paymentIntentId)).catch(() => null);
  const chargeId = typeof pi?.latest_charge === "string" ? pi.latest_charge : pi?.latest_charge?.id ?? null;
  if (!chargeId) {
    console.error("[stripe-webhook] sem charge para transferir, sessão:", session.id);
    return;
  }

  // Agrupa por evento (cada evento → um promotor)
  const byEvent = new Map<string, number>();
  for (const item of items) {
    byEvent.set(item.eventId, (byEvent.get(item.eventId) ?? 0) + Math.round(item.price * item.quantity * 100));
  }

  for (const [eventId, amountCents] of byEvent) {
    if (amountCents <= 0) continue;
    try {
      const evRes = await fetch(
        `${SUPABASE_URL}/rest/v1/events?select=id,promoter_id&id=eq.${encodeURIComponent(eventId)}`,
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } },
      );
      const event = (await evRes.json())[0];
      if (!event?.promoter_id) continue;

      const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/promoter_profiles?select=stripe_account_id,stripe_charges_enabled&user_id=eq.${encodeURIComponent(event.promoter_id)}&limit=1`,
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } },
      );
      const profile = (await profRes.json())[0];
      if (!profile?.stripe_account_id || !profile.stripe_charges_enabled) continue;

      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "eur",
        destination: profile.stripe_account_id,
        source_transaction: chargeId,
        metadata: { eventId, sessionId: session.id },
      });

      const ticketIds = ticketRows.filter((t) => t.event_id === eventId).map((t) => t.id);
      await fetch(
        `${SUPABASE_URL}/rest/v1/tickets?id=in.(${encodeURIComponent(ticketIds.map((id) => `"${id}"`).join(","))})&stripe_transfer_id=is.null`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ stripe_transfer_id: transfer.id, transferred_at: new Date().toISOString() }),
        },
      );
      console.log("[stripe-webhook] transferido", transfer.id, eventId, amountCents);
    } catch (err: any) {
      // Não crítico: o promotor pode receber mais tarde via "Receber vendas"
      console.error("[stripe-webhook] transfer falhou (retentável):", err?.message);
    }
  }
}

async function ticketsExistForSession(sessionId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tickets?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
    { headers: { ...REST_HEADERS, Prefer: "count=exact" } },
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function fulfillSession(session: any) {
  const sessionId: string = session.id;
  const userId: string = session.metadata?.userId ?? "";
  let items: ValidatedItem[] = [];
  try {
    items = JSON.parse(session.metadata?.items ?? "[]");
  } catch {
    items = [];
  }
  if (!userId || items.length === 0) {
    console.error("[stripe-webhook] metadata em falta na sessão", sessionId);
    return;
  }

  // Idempotência: se esta sessão já emitiu bilhetes, ignorar.
  if (await ticketsExistForSession(sessionId)) {
    console.log("[stripe-webhook] sessão já processada:", sessionId);
    return;
  }

  const timestamp = Date.now();
  const ticketRows = items.map((item, index) => {
    const uniqueSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const ticketId = `ticket_${timestamp}_${index}_${uniqueSuffix}`;
    const qrCode = `LYVEN_${ticketId}_${item.eventId}_${uniqueSuffix.toUpperCase()}`;
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 6);
    return {
      id: ticketId,
      event_id: item.eventId,
      user_id: userId,
      ticket_type_id: item.ticketTypeId,
      quantity: item.quantity,
      price: item.price,
      qr_code: qrCode,
      is_used: false,
      valid_until: validUntil.toISOString(),
      purchase_date: new Date().toISOString(),
      stripe_session_id: sessionId,
    };
  });
  await restInsert("tickets", ticketRows);

  // Lugares escolhidos no mapa de lugares (não crítico em caso de falha).
  for (const item of items) {
    if (item.seatLabels && item.seatLabels.length > 0) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/event_seats?event_id=eq.${encodeURIComponent(item.eventId)}&seat_label=in.(${item.seatLabels.join(",")})`,
          {
            method: "PATCH",
            headers: { ...REST_HEADERS, Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "booked",
              booked_by: userId,
              booked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          },
        );
      } catch (err) {
        console.error("[stripe-webhook] erro ao reservar lugares:", err?.message);
      }
    }
  }

  // Notificação ao promotor (não crítico).
  try {
    const eventRes = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(items[0].eventId)}&select=title,promoter_id`,
      { headers: REST_HEADERS },
    );
    const events = await eventRes.json();
    const event = Array.isArray(events) ? events[0] : null;
    if (event?.promoter_id) {
      const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      await restInsert("notifications", [{
        id: `notif_${timestamp}_${crypto.randomUUID().slice(0, 8)}`,
        user_id: event.promoter_id,
        type: "ticket_sold",
        title: "Novo Bilhete Vendido! 🎫",
        message: `${items.reduce((sum, i) => sum + i.quantity, 0)} bilhete(s) vendido(s) para "${event.title}" - €${total.toFixed(2)}`,
        data: JSON.stringify({ eventId: items[0].eventId, quantity: items.reduce((s, i) => s + i.quantity, 0), price: total }),
        is_read: false,
      }]);
    }
  } catch (err) {
    console.error("[stripe-webhook] notificação falhou (não crítico):", err?.message);
  }

  // Email com os bilhetes (QR) para o comprador (não crítico).
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "sendTickets", userId, ticketIds: ticketRows.map((t) => t.id) }),
    });
    if (!res.ok) console.error("[stripe-webhook] email de bilhetes falhou:", res.status, await res.text());
  } catch (err) {
    console.error("[stripe-webhook] email de bilhetes falhou (não crítico):", err?.message);
  }

  // Transferir a parte do promotor (Stripe Connect), se já tiver conta ligada.
  try {
    await transferToPromoters(session, items, ticketRows);
  } catch (err: any) {
    console.error("[stripe-webhook] transferToPromoters falhou (não crítico):", err?.message);
  }

  console.log("[stripe-webhook] bilhetes emitidos para sessão:", sessionId, ticketRows.length);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return new Response("Stripe webhook não configurado", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Assinatura em falta", { status: 400 });
  }

  const payload = await req.text();

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[stripe-webhook] assinatura inválida:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        await fulfillSession(session);
      }
    } else if (event.type === "account.updated") {
      // Estado do onboarding Stripe Connect de um promotor
      const account = event.data.object;
      await fetch(
        `${SUPABASE_URL}/rest/v1/promoter_profiles?stripe_account_id=eq.${encodeURIComponent(account.id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            stripe_charges_enabled: account.charges_enabled ?? false,
            stripe_details_submitted: account.details_submitted ?? false,
            stripe_payouts_enabled: account.payouts_enabled ?? false,
          }),
        },
      );
    }
    // async_payment_failed: o pagamento Multibanco/MB WAY expirou — nada a fazer,
    // os bilhetes simplesmente não são emitidos.
  } catch (err: any) {
    console.error("[stripe-webhook] erro ao processar evento:", err?.message);
    // 500 faz o Stripe repetir o webhook mais tarde.
    return new Response("Erro interno", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
