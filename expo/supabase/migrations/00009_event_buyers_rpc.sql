-- Lista de compradores de um evento para o promotor (ou admin).
-- A RLS da tabela users só deixa cada pessoa ver o próprio perfil, por isso
-- o promotor via os bilhetes mas sem nome/email/telefone do comprador.
-- Esta função devolve esses dados apenas a quem pode gerir o evento
-- (can_validate_event: promotor dono do evento ou admin).

create or replace function public.event_buyers(p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_types jsonb;
begin
  if not public.can_validate_event(p_event_id) then
    return '[]'::jsonb;
  end if;

  select case jsonb_typeof(e.ticket_types::jsonb)
           when 'string' then (e.ticket_types::jsonb #>> '{}')::jsonb
           when 'array' then e.ticket_types::jsonb
           else '[]'::jsonb
         end
    into v_types
    from events e where e.id = p_event_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'userId', t.user_id,
      'name', coalesce(nullif(trim(u.name), ''), au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name', 'Comprador'),
      'email', coalesce(u.email, au.email, ''),
      'phone', coalesce(u.phone, au.phone, ''),
      'ticketTypeId', t.ticket_type_id,
      'ticketType', coalesce((select tt->>'name' from jsonb_array_elements(coalesce(v_types, '[]'::jsonb)) tt where tt->>'id' = t.ticket_type_id limit 1), 'Bilhete'),
      'quantity', t.quantity,
      'price', t.price,
      'qrCode', t.qr_code,
      'isUsed', coalesce(t.is_used, false),
      'validatedAt', t.validated_at,
      'purchaseDate', t.purchase_date
    ) order by t.purchase_date desc nulls last)
    from tickets t
    left join users u on u.id = t.user_id
    left join auth.users au on au.id::text = t.user_id
    where t.event_id = p_event_id
  ), '[]'::jsonb);
end;
$$;

-- Compras do mesmo comprador noutros eventos DESTE promotor (histórico).
create or replace function public.promoter_buyer_history(p_user_id text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticketId', t.id,
    'eventId', e.id,
    'eventTitle', e.title,
    'eventDate', e.date,
    'quantity', t.quantity,
    'price', t.price,
    'isUsed', coalesce(t.is_used, false),
    'purchaseDate', t.purchase_date
  ) order by t.purchase_date desc nulls last), '[]'::jsonb)
  from tickets t
  join events e on e.id = t.event_id
  where t.user_id = p_user_id
    and auth.uid() is not null
    and (
      public.is_admin(auth.uid()::text)
      or e.promoter_id in (select pp.id from promoter_profiles pp where pp.user_id = auth.uid()::text)
    );
$$;

revoke all on function public.event_buyers(text) from public, anon;
revoke all on function public.promoter_buyer_history(text) from public, anon;
grant execute on function public.event_buyers(text) to authenticated;
grant execute on function public.promoter_buyer_history(text) to authenticated;
