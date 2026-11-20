-- Atualizações automáticas dos passes Apple Wallet.
-- 1) O iPhone regista cada passe (dispositivo + push token) via o web service
--    da função wallet-pass → tabela wallet_registrations.
-- 2) Quando um evento muda (título, data, local), events.wallet_updated_at
--    avança e um trigger chama wallet-pass/notify (pg_net), que envia um push
--    vazio pela APNs; o iPhone descarrega o passe atualizado.

create extension if not exists pg_net with schema extensions;

create table if not exists public.wallet_registrations (
  device_library_id text not null,
  push_token text not null,
  pass_type_id text not null,
  serial_number text not null,
  created_at timestamptz not null default now(),
  primary key (device_library_id, pass_type_id, serial_number)
);
create index if not exists wallet_registrations_serial_idx on public.wallet_registrations (serial_number);

-- Só a função (service role) mexe nesta tabela.
alter table public.wallet_registrations enable row level security;
revoke all on public.wallet_registrations from anon, authenticated;

alter table public.events add column if not exists wallet_updated_at timestamptz not null default now();

-- Séries atualizadas desde `p_since_ms` para um dispositivo (pedido do iPhone).
create or replace function public.wallet_updated_serials(p_device text, p_pass_type text, p_since_ms bigint)
returns table (serial_number text, updated_ms bigint)
language sql
security definer
set search_path = public
stable
as $$
  select r.serial_number,
         floor(extract(epoch from e.wallet_updated_at) * 1000)::bigint as updated_ms
  from wallet_registrations r
  join tickets t on t.id = r.serial_number
  join events e on e.id = t.event_id
  where r.device_library_id = p_device
    and r.pass_type_id = p_pass_type
    and (p_since_ms is null or floor(extract(epoch from e.wallet_updated_at) * 1000)::bigint > p_since_ms);
$$;
revoke all on function public.wallet_updated_serials(text, text, bigint) from public, anon, authenticated;

-- Push tokens dos passes de um evento.
create or replace function public.wallet_event_push_tokens(p_event_id text)
returns table (push_token text, device_library_id text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct r.push_token, r.device_library_id
  from wallet_registrations r
  join tickets t on t.id = r.serial_number
  where t.event_id = p_event_id;
$$;
revoke all on function public.wallet_event_push_tokens(text) from public, anon, authenticated;

create or replace function public.events_wallet_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if (new.title, new.date, new.end_date, new.venue_name, new.venue_address, new.venue_city)
     is distinct from
     (old.title, old.date, old.end_date, old.venue_name, old.venue_address, old.venue_city) then
    new.wallet_updated_at := now();

    if exists (
      select 1 from wallet_registrations r join tickets t on t.id = r.serial_number
      where t.event_id = new.id
    ) then
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'wallet_notify_secret';
      if v_secret is not null then
        perform net.http_post(
          url := 'https://fmjgrewkknqvxqwkouqj.supabase.co/functions/v1/wallet-pass/notify',
          body := jsonb_build_object('eventId', new.id),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-wallet-notify-secret', v_secret)
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_wallet_touch on public.events;
create trigger events_wallet_touch
  before update on public.events
  for each row execute function public.events_wallet_touch();
