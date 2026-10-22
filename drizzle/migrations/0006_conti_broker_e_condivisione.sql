ALTER TABLE public.ordini_ia ADD COLUMN IF NOT EXISTS conto_id text;
ALTER TABLE public.ordini_ia ADD COLUMN IF NOT EXISTS conto_attribuzione text;
COMMENT ON COLUMN public.ordini_ia.conto_id IS 'Identificativo stabile del conto broker (alpaca:<account id> o impronta:<hash chiave>). NULL = conto non determinato.';
COMMENT ON COLUMN public.ordini_ia.conto_attribuzione IS 'Provenienza di conto_id: motore (scritto al momento dell ordine) | verificato_broker (abbinato a un ordine presente nello storico del broker).';
CREATE INDEX IF NOT EXISTS ordini_ia_conto_idx ON public.ordini_ia (user_id, piattaforma, ambiente, conto_id);

CREATE TABLE public.conti_broker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  piattaforma text NOT NULL,
  ambiente text NOT NULL CHECK (ambiente IN ('paper','reale')),
  conto_id text NOT NULL,
  verificato boolean NOT NULL DEFAULT false,
  etichetta text,
  stato text NOT NULL DEFAULT 'attivo' CHECK (stato IN ('attivo','da_confermare','archiviato')),
  motivo text,
  collegato_il timestamptz NOT NULL DEFAULT now(),
  ultimo_visto timestamptz NOT NULL DEFAULT now(),
  archiviato_il timestamptz,
  riconciliato_il timestamptz,
  UNIQUE (user_id, piattaforma, ambiente, conto_id)
);
GRANT SELECT ON public.conti_broker TO authenticated;
GRANT ALL ON public.conti_broker TO service_role;
ALTER TABLE public.conti_broker ENABLE ROW LEVEL SECURITY;
CREATE POLICY conti_broker_select_own ON public.conti_broker FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.link_condivisione (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  opzioni jsonb NOT NULL DEFAULT '{}'::jsonb,
  scade_il timestamptz NOT NULL,
  revocato_il timestamptz,
  ultimo_accesso timestamptz,
  accessi integer NOT NULL DEFAULT 0,
  finestra_inizio timestamptz,
  accessi_finestra integer NOT NULL DEFAULT 0,
  creato_il timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.link_condivisione TO authenticated;
GRANT ALL ON public.link_condivisione TO service_role;
ALTER TABLE public.link_condivisione ENABLE ROW LEVEL SECURITY;
CREATE POLICY link_condivisione_select_own ON public.link_condivisione FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE SELECT (token_hash) ON public.link_condivisione FROM authenticated;