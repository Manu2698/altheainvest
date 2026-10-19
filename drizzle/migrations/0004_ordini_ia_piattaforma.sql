ALTER TABLE public.ordini_ia ADD COLUMN piattaforma text NOT NULL DEFAULT 'alpaca';

COMMENT ON COLUMN public.ordini_ia.piattaforma IS 'Piattaforma su cui l''IA ha inviato l''ordine: alpaca, trading212, binance, kraken, coinbase, etoro.';

UPDATE public.ordini_ia SET piattaforma = CASE
  WHEN motivo LIKE '[Trading 212]%' THEN 'trading212'
  WHEN motivo LIKE '[Binance]%' THEN 'binance'
  WHEN motivo LIKE '[Kraken]%' THEN 'kraken'
  WHEN motivo LIKE '[Coinbase]%' THEN 'coinbase'
  WHEN motivo LIKE '[eToro]%' THEN 'etoro'
  ELSE 'alpaca'
END;

CREATE INDEX ordini_ia_piattaforma_idx ON public.ordini_ia (user_id, ambiente, piattaforma, created_at DESC);