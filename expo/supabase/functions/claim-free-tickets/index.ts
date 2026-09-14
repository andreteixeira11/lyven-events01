// Emissão de bilhetes gratuitos (€0) sem passar pelo Stripe.
// POST { items: [{ eventId, ticketTypeId, quantity, price, seatLabels? }] } com
// Authorization do utilizador. O servidor valida que cada tipo de bilhete é
// realmente gratuito antes de emitir — o cliente nunca decide o preço.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const REST_HEADERS = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

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

async function restInsert(table: string, rows: unknown[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...REST_HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status}`);
}

interface ClaimItem {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  seatLabels?: string[];
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

    const body = await req.json();
    const items: ClaimItem[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return json({ error: "Nenhum bilhete selecionado" }, 400);

    // Validação servidor-a-servidor: cada tipo tem de custar €0 e estar à venda.
    for (const item of items) {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 0));
      if (quantity < 1) return json({ error: "Quantidade inválida" }, 400);

      const eventRes = await fetch(
        `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(item.eventId)}&select=title,status,ticket_types,promoter_id`,
        { headers: REST_HEADERS }
      );
      const events = await eventRes.json();
      const event = Array.isArray(events) ? events[0] : null;
      if (!event) return json({ error: "Evento não encontrado." }, 404);
      if (event.status !== "published") {
        return json({ error: `O evento "${event.title}" não está disponível.` }, 400);
      }

      let ticketTypes: Array<Record<string, any>> = [];
      try {
        ticketTypes = typeof event.ticket_types === "string"
          ? JSON.parse(event.ticket_types)
          : event.ticket_types ?? [];
      } catch {
        ticketTypes = [];
      }
      const tt = ticketTypes.find((t) => t.id === item.ticketTypeId);
      if (!tt) return json({ error: "Tipo de bilhete não encontrado." }, 404);
      if (tt.active === false) {
        return json({ error: `"${tt.name}" já não está disponível neste evento.` }, 400);
      }
      if (Number(tt.price) !== 0) {
        return json({ error: `"${tt.name}" já não é gratuito — o pagamento passou a ser necessário.` }, 400);
      }
      const available = Number(tt.available);
      if (Number.isFinite(available) && quantity > available) {
        return json({ error: `Só restam ${available} bilhete(s) "${tt.name}".` }, 400);
      }
      const maxPerPerson = Number(tt.maxPerPerson) || 4;
      if (quantity > maxPerPerson) {
        return json({ error: `Máximo de ${maxPerPerson} bilhete(s) "${tt.name}" por pessoa.` }, 400);
      }
    }

    // Emite os bilhetes (mesma forma que o webhook do Stripe).
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
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        price: 0,
        qr_code: qrCode,
        is_used: false,
        valid_until: validUntil.toISOString(),
        purchase_date: new Date().toISOString(),
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
            }
          );
        } catch (err) {
          console.error("[claim-free-tickets] erro ao reservar lugares:", err?.message);
        }
      }
    }

    // Notificação ao promotor (não crítica).
    try {
      const eventRes = await fetch(
        `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(items[0].eventId)}&select=title,promoter_id`,
        { headers: REST_HEADERS }
      );
      const events = await eventRes.json();
      const event = Array.isArray(events) ? events[0] : null;
      if (event?.promoter_id) {
        const totalQty = items.reduce((sum, i) => sum + Math.max(1, Math.floor(Number(i.quantity) || 1)), 0);
        await restInsert("notifications", [{
          id: `notif_${timestamp}_${crypto.randomUUID().slice(0, 8)}`,
          user_id: event.promoter_id,
          type: "ticket_claimed",
          title: "Bilhetes Grátis Reservados 🎟️",
          message: `${totalQty} bilhete(s) gratuito(s) reservado(s) para "${event.title}"`,
          data: JSON.stringify({ eventId: items[0].eventId, quantity: totalQty, free: true }),
          is_read: false,
        }]);
      }
    } catch (err) {
      console.error("[claim-free-tickets] notificação falhou:", err?.message);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[claim-free-tickets] error:", err);
    return json({ error: "Não foi possível emitir os bilhetes. Tenta novamente." }, 500);
  }
});
