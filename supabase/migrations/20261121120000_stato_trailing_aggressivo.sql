create table if not exists public.stato_trailing_aggressivo (
  user_id uuid not null references auth.users(id) on delete cascade,
  piattaforma text not null default 'alpaca' check (piattaforma = 'alpaca'),
  ambiente text not null check (ambiente in ('paper','reale')),
  conto_id text not null,
  ticker text not null,
  picco_pnl_pct numeric not null default 0,
  aggiornato_al timestamptz not null default now(),
  primary key (user_id, piattaforma, ambiente, conto_id, ticker),
  check (picco_pnl_pct between -100 and 100000)
);
alter table public.stato_trailing_aggressivo enable row level security;
revoke all on public.stato_trailing_aggressivo from anon, authenticated;
grant all on public.stato_trailing_aggressivo to service_role;
