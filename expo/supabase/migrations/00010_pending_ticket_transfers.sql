-- Transferências de bilhetes para emails sem conta Lyven.
-- O bilhete fica "pendente" para esse email (sai da lista do remetente) e o
-- destinatário recebe o código QR por email. Quando criar conta com esse email,
-- os bilhetes passam automaticamente para a conta nova.

alter table public.tickets
  add column if not exists pending_transfer_email text,
  add column if not exists transferred_from text;

create index if not exists tickets_pending_transfer_email_idx
  on public.tickets (lower(pending_transfer_email))
  where pending_transfer_email is not null;

-- Entrega os bilhetes pendentes a um utilizador, só se o email do perfil
-- for o email verificado da conta de autenticação (impede roubo de bilhetes
-- por quem escreva o email de outra pessoa no seu perfil).
create or replace function public.claim_pending_tickets_for(p_user_id text, p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_user_id is null or coalesce(p_email, '') = '' then
    return 0;
  end if;
  if not exists (
    select 1 from auth.users a
    where a.id::text = p_user_id and lower(a.email) = lower(p_email)
  ) then
    return 0;
  end if;

  update public.tickets
     set user_id = p_user_id,
         pending_transfer_email = null
   where pending_transfer_email is not null
     and lower(pending_transfer_email) = lower(p_email);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.claim_pending_tickets_for(text, text) from public, anon, authenticated;

-- Chamado pela app depois do login: reclama os bilhetes pendentes do próprio utilizador.
create or replace function public.claim_my_pending_tickets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_email text;
begin
  if v_uid is null then
    return 0;
  end if;
  select email into v_email from auth.users where id = auth.uid();
  return public.claim_pending_tickets_for(v_uid, v_email);
end;
$$;

revoke all on function public.claim_my_pending_tickets() from public, anon;
grant execute on function public.claim_my_pending_tickets() to authenticated;

-- Ao criar (ou corrigir o email de) um perfil, reclama logo os bilhetes pendentes.
create or replace function public.users_claim_pending_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.claim_pending_tickets_for(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists users_claim_pending_tickets on public.users;
create trigger users_claim_pending_tickets
  after insert or update of email on public.users
  for each row execute function public.users_claim_pending_tickets();
