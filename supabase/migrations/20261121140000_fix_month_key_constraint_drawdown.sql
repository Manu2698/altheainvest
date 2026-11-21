alter table public.stato_drawdown_mensile
  drop constraint if exists stato_drawdown_mensile_mese_check;
alter table public.stato_drawdown_mensile
  add constraint stato_drawdown_mensile_mese_check
  check (mese ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
