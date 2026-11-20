-- Validação de bilhetes no servidor.
-- A tabela tickets não tem política de UPDATE, por isso a validação feita
-- diretamente pela app nunca ficava guardada (e o mesmo bilhete podia ser
-- "validado" várias vezes). Esta função valida de forma atómica: só a
-- primeira leitura marca o bilhete como usado; as seguintes devolvem
-- "already_used".

create or replace function public.can_validate_event(p_event_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and (
    public.is_admin(auth.uid()::text)
    or exists (
      select 1
      from events e
      join promoter_profiles pp on pp.id = e.promoter_id
      where e.id = p_event_id and pp.user_id = auth.uid()::text
    )
  );
$$;

create or replace function public.validate_ticket(
  p_qr_code text default null,
  p_ticket_id text default null,
  p_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tickets%rowtype;
  v_updated int;
  v_buyer jsonb;
  v_type_name text;
  v_validated int;
  v_total int;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Sessão inválida');
  end if;

  if p_ticket_id is not null then
    select * into t from tickets where id = p_ticket_id;
  elsif p_qr_code is not null then
    select * into t from tickets where qr_code = trim(p_qr_code) limit 1;
  end if;

  if t.id is null then
    return jsonb_build_object('status', 'not_found', 'message', 'Bilhete não encontrado');
  end if;

  if not public.can_validate_event(t.event_id) then
    return jsonb_build_object('status', 'forbidden', 'message', 'Sem permissão para validar bilhetes deste evento');
  end if;

  if p_event_id is not null and t.event_id <> p_event_id then
    return jsonb_build_object('status', 'wrong_event', 'message', 'Bilhete não é para este evento');
  end if;

  select jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email)
    into v_buyer from users u where u.id = t.user_id;

  select tt->>'name' into v_type_name
  from events e,
       jsonb_array_elements(
         case jsonb_typeof(e.ticket_types::jsonb)
           when 'string' then (e.ticket_types::jsonb #>> '{}')::jsonb
           when 'array' then e.ticket_types::jsonb
           else '[]'::jsonb
         end
       ) tt
  where e.id = t.event_id and tt->>'id' = t.ticket_type_id
  limit 1;

  if t.valid_until is not null and t.valid_until < now() and not coalesce(t.is_used, false) then
    return jsonb_build_object(
      'status', 'expired', 'message', 'Bilhete expirado',
      'ticket', to_jsonb(t), 'buyer', v_buyer, 'ticketTypeName', v_type_name
    );
  end if;

  -- Atómico: só uma leitura consegue passar de não usado para usado.
  update tickets
     set is_used = true,
         validated_at = now(),
         used_at = now(),
         validated_by = auth.uid()::text
   where id = t.id and coalesce(is_used, false) = false;
  get diagnostics v_updated = row_count;

  select * into t from tickets where id = t.id;

  select coalesce(sum(quantity) filter (where is_used), 0), coalesce(sum(quantity), 0)
    into v_validated, v_total
    from tickets where event_id = t.event_id;

  return jsonb_build_object(
    'status', case when v_updated = 1 then 'valid' else 'already_used' end,
    'message', case when v_updated = 1 then 'Bilhete válido!' else 'Bilhete já utilizado' end,
    'ticket', to_jsonb(t),
    'buyer', v_buyer,
    'ticketTypeName', v_type_name,
    'validatedCount', v_validated,
    'totalCount', v_total
  );
end;
$$;

-- Contagem real de entradas validadas / bilhetes vendidos de um evento.
create or replace function public.event_validation_stats(p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_validate_event(p_event_id) then
    return jsonb_build_object('validatedCount', 0, 'totalCount', 0);
  end if;
  return (
    select jsonb_build_object(
      'validatedCount', coalesce(sum(quantity) filter (where is_used), 0),
      'totalCount', coalesce(sum(quantity), 0)
    )
    from tickets where event_id = p_event_id
  );
end;
$$;

revoke all on function public.validate_ticket(text, text, text) from public, anon;
revoke all on function public.event_validation_stats(text) from public, anon;
revoke all on function public.can_validate_event(text) from public, anon;
grant execute on function public.validate_ticket(text, text, text) to authenticated;
grant execute on function public.event_validation_stats(text) to authenticated;
grant execute on function public.can_validate_event(text) to authenticated;
