-- Stripe Connect: promotores recebem as vendas diretamente na sua conta
-- Stripe; a Lyven fica com a taxa de serviço.
alter table public.promoter_profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

create index if not exists promoter_profiles_stripe_account_idx
  on public.promoter_profiles (stripe_account_id)
  where stripe_account_id is not null;

-- Rasto da transferência de cada bilhete para a conta do promotor
-- (null = ainda por transferir; aplica-se só a bilhetes pagos).
alter table public.tickets
  add column if not exists stripe_transfer_id text,
  add column if not exists transferred_at timestamptz;

create index if not exists tickets_transfer_pending_idx
  on public.tickets (stripe_transfer_id)
  where stripe_transfer_id is null;
