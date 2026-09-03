// Stripe Checkout — cria sessões de pagamento e consulta o estado.
// Ação "create": valida o carrinho no servidor (preços reais vindos da BD,
// nunca confiados ao cliente) e devolve o URL do Checkout hospedado do Stripe.
// Ação "status": consulta o estado de pagamento de uma sessão (usado pela app
// ao regressar do Stripe, para confirmar a compra mesmo que o webhook demore).
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

interface CheckoutItem {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  seatLabels?: string[];
}

interface CreateRequest {
  action: "create";
  items: CheckoutItem[];
  userId: string;
  userEmail: string;
  paymentMethod: "card" | "mbway" | "multibanco";
  returnUrl: string;
  cancelUrl: string;
}

interface StatusRequest {
  action: "status";
  sessionId: string;
}

const PAYMENT_METHODS: Record<string, string[]> = {
  card: ["card"],
  mbway: ["mb_way"],
  multibanco: ["multibanco"],
};

async function fetchEvent(eventId: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=*`, {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!STRIPE_SECRET_KEY) {
    return json({ error: "Stripe não está configurado (STRIPE_SECRET_KEY em falta)." }, 503);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil",
  });

  let body: (CreateRequest | StatusRequest) & { action: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }

  try {
    if (body.action === "ping") {
      return json({ configured: !!STRIPE_SECRET_KEY, publishableKey: null });
    }

    if (body.action === "status") {
      const session = await stripe.checkout.sessions.retrieve(body.sessionId);
      return json({
        paid: session.payment_status === "paid",
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? "eur",
        email: session.customer_details?.email ?? null,
      });
    }

    if (body.action !== "create") {
      return json({ error: "Ação desconhecida." }, 400);
    }

    const { items, userId, userEmail, paymentMethod, returnUrl, cancelUrl } = body as CreateRequest;

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "Carrinho vazio." }, 400);
    }
    if (!PAYMENT_METHODS[paymentMethod]) {
      return json({ error: "Método de pagamento não suportado." }, 400);
    }

    // Validação servidor-a-servidor: preços e disponibilidade vêm SEMPRE da BD.
    const lineItems: Array<Record<string, unknown>> = [];
    const validatedItems: Array<CheckoutItem & { price: number; eventTitle: string; ticketTypeName: string }> = [];

    for (const item of items) {
      const quantity = Math.floor(Number(item.quantity));
      if (!item.eventId || !item.ticketTypeId || !Number.isFinite(quantity) || quantity < 1) {
        return json({ error: "Artigo inválido no carrinho." }, 400);
      }

      const event = await fetchEvent(item.eventId);
      if (!event) return json({ error: "Evento não encontrado." }, 404);
      if (event.status !== "published") {
        return json({ error: `O evento "${event.title}" não está disponível para venda.` }, 400);
      }

      let ticketTypes: Array<Record<string, any>> = [];
      try {
        ticketTypes = typeof event.ticket_types === "string" ? JSON.parse(event.ticket_types) : event.ticket_types ?? [];
      } catch {
        ticketTypes = [];
      }
      const tt = ticketTypes.find((t) => t.id === item.ticketTypeId);
      if (!tt) return json({ error: "Tipo de bilhete não encontrado." }, 404);
      if (tt.active === false) {
        return json({ error: `"${tt.name}" já não está à venda neste evento.` }, 400);
      }

      const price = Number(tt.price) || 0;
      const available = Number(tt.available);
      if (Number.isFinite(available) && quantity > available) {
        return json({ error: `Só restam ${available} bilhete(s) "${tt.name}".` }, 400);
      }
      const maxPerPerson = Number(tt.maxPerPerson) || 4;
      if (quantity > maxPerPerson) {
        return json({ error: `Máximo de ${maxPerPerson} bilhete(s) "${tt.name}" por pessoa.` }, 400);
      }

      const typeName = String(tt.name ?? "Bilhete");
      validatedItems.push({ ...item, quantity, price, eventTitle: event.title, ticketTypeName: typeName });
      lineItems.push({
        quantity,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${event.title} — ${typeName}`,
            ...(event.image && !event.image.startsWith("file://") ? { images: [event.image] } : {}),
          },
        },
      });
    }

    const total = validatedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: PAYMENT_METHODS[paymentMethod],
      line_items: lineItems,
      customer_email: userEmail || undefined,
      locale: "pt",
      success_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cancelUrl}${cancelUrl.includes("?") ? "&" : "?"}stripe_cancel=1`,
      metadata: {
        userId,
        items: JSON.stringify(validatedItems.map((i) => ({
          eventId: i.eventId,
          ticketTypeId: i.ticketTypeId,
          quantity: i.quantity,
          price: i.price,
          eventTitle: i.eventTitle,
          ticketTypeName: i.ticketTypeName,
          seatLabels: i.seatLabels ?? [],
        }))),
      },
      ...(total < 0.5 ? {} : {}),
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.error("[stripe-checkout] error:", err?.message);
    return json({ error: err?.message ?? "Erro ao criar pagamento." }, 500);
  }
});
