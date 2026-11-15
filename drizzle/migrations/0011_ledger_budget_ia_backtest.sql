CREATE TABLE public.ia_backtest_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  max_chiamate integer NOT NULL CHECK (max_chiamate BETWEEN 1 AND 200),
  riservate integer NOT NULL DEFAULT 0 CHECK (riservate >= 0),
  stato text NOT NULL DEFAULT 'attivo' CHECK (stato IN ('attivo','bloccato','negato','chiuso')),
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ia_backtest_chiamate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ia_backtest_run(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chiave text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('screening','comitato')),
  riservate integer NOT NULL CHECK (riservate BETWEEN 1 AND 20),
  effettive integer,
  stato text NOT NULL DEFAULT 'riservata' CHECK (stato IN ('riservata','completata','fallita','incerta')),
  risultato jsonb,
  errore text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, chiave)
);
CREATE INDEX ia_backtest_run_user_idx ON public.ia_backtest_run(user_id, created_at);

GRANT SELECT ON public.ia_backtest_run TO authenticated;
GRANT SELECT ON public.ia_backtest_chiamate TO authenticated;
GRANT ALL ON public.ia_backtest_run TO service_role;
GRANT ALL ON public.ia_backtest_chiamate TO service_role;
ALTER TABLE public.ia_backtest_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_backtest_chiamate ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_backtest_run_own ON public.ia_backtest_run FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ia_backtest_chiamate_own ON public.ia_backtest_chiamate FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ia_backtest_apri_run(p_user uuid, p_max integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usate integer; v_id uuid;
BEGIN
  IF p_max IS NULL OR p_max < 1 OR p_max > 200 THEN RAISE EXCEPTION 'Budget run non valido (1-200).'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ia_backtest:' || p_user::text));
  SELECT COALESCE(sum(riservate),0) INTO v_usate FROM public.ia_backtest_run WHERE user_id = p_user AND created_at > now() - interval '24 hours';
  IF v_usate + p_max > 300 THEN RAISE EXCEPTION 'Limite giornaliero IA backtest raggiunto (%/300 riservate).', v_usate; END IF;
  INSERT INTO public.ia_backtest_run(user_id, max_chiamate) VALUES (p_user, p_max) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ia_backtest_riserva(p_user uuid, p_run uuid, p_chiave text, p_tipo text, p_n integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ia_backtest_run%ROWTYPE; c public.ia_backtest_chiamate%ROWTYPE; v_usate integer;
BEGIN
  IF p_n IS NULL OR p_n < 1 OR p_n > 20 OR p_chiave IS NULL OR length(p_chiave) <> 64 THEN RAISE EXCEPTION 'Prenotazione non valida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ia_backtest:' || p_user::text));
  SELECT * INTO r FROM public.ia_backtest_run WHERE id = p_run AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run IA inesistente.'; END IF;
  SELECT * INTO c FROM public.ia_backtest_chiamate WHERE run_id = p_run AND chiave = p_chiave;
  IF FOUND THEN RETURN jsonb_build_object('esito','esistente','stato',c.stato,'risultato',c.risultato,'errore',c.errore); END IF;
  IF r.stato <> 'attivo' THEN RETURN jsonb_build_object('esito','bloccato','stato',r.stato,'motivo',r.motivo); END IF;
  IF r.riservate + p_n > r.max_chiamate THEN RETURN jsonb_build_object('esito','budget','riservate',r.riservate,'max',r.max_chiamate); END IF;
  SELECT COALESCE(sum(riservate),0) INTO v_usate FROM public.ia_backtest_run WHERE user_id = p_user AND created_at > now() - interval '24 hours';
  IF v_usate + p_n > 300 THEN RETURN jsonb_build_object('esito','budget','motivo','limite giornaliero'); END IF;
  INSERT INTO public.ia_backtest_chiamate(run_id, user_id, chiave, tipo, riservate) VALUES (p_run, p_user, p_chiave, p_tipo, p_n);
  UPDATE public.ia_backtest_run SET riservate = riservate + p_n, updated_at = now() WHERE id = p_run;
  RETURN jsonb_build_object('esito','riservata','riservate',r.riservate + p_n,'max',r.max_chiamate);
END $$;

CREATE OR REPLACE FUNCTION public.ia_backtest_chiudi(p_user uuid, p_run uuid, p_chiave text, p_stato text, p_effettive integer, p_risultato jsonb, p_errore text, p_stato_run text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.ia_backtest_chiamate%ROWTYPE;
BEGIN
  IF p_stato NOT IN ('completata','fallita','incerta') THEN RAISE EXCEPTION 'Stato non valido.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ia_backtest:' || p_user::text));
  SELECT * INTO c FROM public.ia_backtest_chiamate WHERE run_id = p_run AND chiave = p_chiave AND user_id = p_user AND stato = 'riservata' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.ia_backtest_chiamate SET stato = p_stato, effettive = p_effettive, risultato = p_risultato, errore = p_errore, updated_at = now() WHERE id = c.id;
  -- Only completed calls with a known count release unused reservation; failures keep the full reservation.
  IF p_stato = 'completata' AND p_effettive IS NOT NULL AND p_effettive >= 0 AND p_effettive < c.riservate THEN
    UPDATE public.ia_backtest_run SET riservate = riservate - (c.riservate - p_effettive), updated_at = now() WHERE id = p_run;
  END IF;
  IF p_stato_run IS NOT NULL THEN
    IF p_stato_run NOT IN ('bloccato','negato','chiuso') THEN RAISE EXCEPTION 'Stato run non valido.'; END IF;
    UPDATE public.ia_backtest_run SET stato = p_stato_run, motivo = p_errore, updated_at = now() WHERE id = p_run AND stato = 'attivo';
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.ia_backtest_apri_run(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ia_backtest_riserva(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ia_backtest_chiudi(uuid, uuid, text, text, integer, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_backtest_apri_run(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_backtest_riserva(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ia_backtest_chiudi(uuid, uuid, text, text, integer, jsonb, text, text) TO service_role;