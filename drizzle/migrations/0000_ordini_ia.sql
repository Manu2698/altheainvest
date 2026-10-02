CREATE TABLE public.ordini_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategia text NOT NULL,
  ambiente text NOT NULL DEFAULT 'paper',
  ticker text NOT NULL,
  lato text NOT NULL,
  importo numeric NOT NULL DEFAULT 0,
  pnl_pct numeric,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ordini_ia TO authenticated;
GRANT ALL ON public.ordini_ia TO service_role;
ALTER TABLE public.ordini_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY ordini_ia_select_own ON public.ordini_ia FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ordini_ia_user_idx ON public.ordini_ia (user_id, created_at DESC);