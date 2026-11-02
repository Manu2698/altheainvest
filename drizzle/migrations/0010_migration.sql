CREATE TABLE public.analisi_comitato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conto_id text,
  ambiente text NOT NULL,
  strategia text NOT NULL,
  ticker text NOT NULL,
  proposta text NOT NULL,
  decisione text NOT NULL,
  veto boolean NOT NULL DEFAULT false,
  esito_dibattito text,
  motivo text NOT NULL,
  agenti jsonb NOT NULL DEFAULT '{}'::jsonb,
  dibattito jsonb NOT NULL DEFAULT '[]'::jsonb,
  dati jsonb NOT NULL DEFAULT '{}'::jsonb,
  errore text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.analisi_comitato TO authenticated;
GRANT ALL ON public.analisi_comitato TO service_role;
ALTER TABLE public.analisi_comitato ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lettura proprie analisi" ON public.analisi_comitato FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX analisi_comitato_cache ON public.analisi_comitato (user_id, ambiente, ticker, proposta, created_at DESC);