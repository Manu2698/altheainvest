CREATE TABLE public.automazioni_conti (
  user_id uuid NOT NULL,
  piattaforma text NOT NULL DEFAULT 'alpaca',
  ambiente text NOT NULL DEFAULT 'paper',
  attivo boolean NOT NULL DEFAULT false,
  strategia text NOT NULL DEFAULT 'medio',
  capitale numeric NOT NULL DEFAULT 0,
  modalita text NOT NULL DEFAULT 'limite',
  perdita_max_giornaliera numeric,
  pausa_motivo text,
  pausa_il timestamptz,
  ultimo_ciclo timestamptz,
  ultimo_esito jsonb,
  bloccato_fino timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, piattaforma, ambiente),
  CHECK (ambiente IN ('paper', 'reale')),
  CHECK (modalita IN ('limite', 'conto')),
  CHECK (strategia IN ('conservativo', 'medio', 'aggressivo'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automazioni_conti TO authenticated;
GRANT ALL ON public.automazioni_conti TO service_role;

ALTER TABLE public.automazioni_conti ENABLE ROW LEVEL SECURITY;

CREATE POLICY automazioni_conti_own ON public.automazioni_conti
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO public.automazioni_conti (user_id, piattaforma, ambiente, attivo, strategia, capitale, modalita, perdita_max_giornaliera, pausa_motivo, pausa_il, ultimo_ciclo, ultimo_esito, bloccato_fino, updated_at)
SELECT user_id, piattaforma, CASE WHEN reale THEN 'reale' ELSE 'paper' END, attivo, strategia, capitale, modalita, perdita_max_giornaliera, pausa_motivo, pausa_il, ultimo_ciclo, ultimo_esito, bloccato_fino, updated_at
FROM public.automazioni_ia;

COMMENT ON TABLE public.automazioni_ia IS 'DEPRECATED: replaced by automazioni_conti (un motore per conto = piattaforma + ambiente).';