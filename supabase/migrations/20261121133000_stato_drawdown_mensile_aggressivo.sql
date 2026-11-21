create table if not exists public.stato_drawdown_mensile (
  user_id uuid not null references auth.users(id) on delete cascade,
  piattaforma text not null default 'alpaca' check (piattaforma = 'alpaca'),
  ambiente text not null check (ambiente in ('paper','reale')),
  conto_id text not null,
  mese text not null check (mese ~ '^\\d{4}-\\d{2}$'),
  picco_equity numeric not null check (picco_equity > 0),
  bloccato boolean not null default false,
  aggiornato_al timestamptz not null default now(),
  primary key (user_id, piattaforma, ambiente, conto_id, mese)
);
alter table public.stato_drawdown_mensile enable row level security;
revoke all on public.stato_drawdown_mensile from anon, authenticated;
grant all on public.stato_drawdown_mensile to service_role;
