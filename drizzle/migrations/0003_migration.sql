CREATE TABLE public.piattaforme_credenziali (
  user_id uuid NOT NULL,
  piattaforma text NOT NULL CHECK (piattaforma IN ('trading212','binance','kraken','coinbase','etoro')),
  ambiente text NOT NULL CHECK (ambiente IN ('paper','reale')),
  key_id text NOT NULL,
  api_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, piattaforma, ambiente)
);
ALTER TABLE public.piattaforme_credenziali ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piattaforme_credenziali FROM anon, authenticated;
GRANT ALL ON public.piattaforme_credenziali TO service_role;

ALTER TABLE public.automazioni_ia ADD COLUMN piattaforma text NOT NULL DEFAULT 'alpaca'
  CHECK (piattaforma IN ('alpaca','trading212','binance','kraken','coinbase','etoro'));