CREATE TABLE public.automazioni_ia (
  user_id uuid PRIMARY KEY,
  attivo boolean NOT NULL DEFAULT false,
  reale boolean NOT NULL DEFAULT false,
  strategia text NOT NULL DEFAULT 'medio' CHECK (strategia IN ('conservativo','medio','aggressivo')),
  capitale numeric NOT NULL DEFAULT 1 CHECK (capitale >= 0),
  modalita text NOT NULL DEFAULT 'limite' CHECK (modalita IN ('limite','conto')),
  ultimo_ciclo timestamptz,
  ultimo_esito jsonb,
  bloccato_fino timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.automazioni_ia TO authenticated;
GRANT ALL ON public.automazioni_ia TO service_role;
ALTER TABLE public.automazioni_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.automazioni_ia FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.automazioni_ia FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.automazioni_ia FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX automazioni_attive ON public.automazioni_ia (attivo, ultimo_ciclo);