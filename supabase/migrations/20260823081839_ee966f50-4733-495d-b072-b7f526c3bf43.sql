-- Credenziali broker per utente (accessibili solo dal server)
CREATE TABLE public.broker_credenziali (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ambiente text NOT NULL CHECK (ambiente IN ('paper','reale')),
  key_id text NOT NULL,
  api_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ambiente)
);
GRANT ALL ON public.broker_credenziali TO service_role;
ALTER TABLE public.broker_credenziali ENABLE ROW LEVEL SECURITY;

-- Movimenti di cassa (depositi e prelievi)
CREATE TABLE public.movimenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('deposito','prelievo')),
  importo numeric(14,2) NOT NULL CHECK (importo > 0),
  valuta text NOT NULL DEFAULT 'USD',
  ambiente text NOT NULL DEFAULT 'paper' CHECK (ambiente IN ('paper','reale')),
  metodo text NOT NULL DEFAULT 'bonifico',
  stato text NOT NULL DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa','completato','rifiutato')),
  riferimento text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimenti_user_created_idx ON public.movimenti (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.movimenti TO authenticated;
GRANT ALL ON public.movimenti TO service_role;
ALTER TABLE public.movimenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movimenti_select_own" ON public.movimenti FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "movimenti_insert_own" ON public.movimenti FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Profilo utente
CREATE TABLE public.profili (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profili TO authenticated;
GRANT ALL ON public.profili TO service_role;
ALTER TABLE public.profili ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profili_own" ON public.profili FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profili (id, nome)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'nome')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();