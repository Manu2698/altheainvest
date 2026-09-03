CREATE TABLE public.ordini_pianificati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  lato text NOT NULL DEFAULT 'buy',
  importo numeric NOT NULL,
  quantita numeric,
  reale boolean NOT NULL DEFAULT false,
  esegui_il timestamptz NOT NULL,
  stato text NOT NULL DEFAULT 'in_attesa',
  ordine_id text,
  errore text,
  created_at timestamptz NOT NULL DEFAULT now(),
  eseguito_il timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordini_pianificati TO authenticated;
GRANT ALL ON public.ordini_pianificati TO service_role;
ALTER TABLE public.ordini_pianificati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ordini_pianificati_own" ON public.ordini_pianificati FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ordini_pianificati_utente_idx ON public.ordini_pianificati (user_id, esegui_il);