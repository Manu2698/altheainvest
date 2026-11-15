CREATE INDEX IF NOT EXISTS ia_backtest_chiamate_user_chiave_idx ON public.ia_backtest_chiamate(user_id, chiave);
CREATE OR REPLACE FUNCTION public.ia_backtest_riserva(p_user uuid, p_run uuid, p_chiave text, p_tipo text, p_n integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ia_backtest_run%ROWTYPE; c public.ia_backtest_chiamate%ROWTYPE; v_usate integer;
BEGIN
  IF p_n IS NULL OR p_n < 1 OR p_n > 20 OR p_chiave IS NULL OR length(p_chiave) <> 64 OR p_tipo NOT IN ('screening','comitato') THEN RAISE EXCEPTION 'Prenotazione non valida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ia_backtest:' || p_user::text));
  SELECT * INTO r FROM public.ia_backtest_run WHERE id = p_run AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run IA inesistente.'; END IF;
  SELECT * INTO c FROM public.ia_backtest_chiamate WHERE run_id = p_run AND chiave = p_chiave;
  IF FOUND THEN RETURN jsonb_build_object('esito','esistente','stato',c.stato,'risultato',c.risultato,'errore',c.errore); END IF;
  SELECT * INTO c FROM public.ia_backtest_chiamate WHERE user_id = p_user AND chiave = p_chiave AND stato = 'completata' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('esito','esistente','stato',c.stato,'risultato',c.risultato,'errore',c.errore); END IF;
  IF r.stato <> 'attivo' THEN RETURN jsonb_build_object('esito','bloccato','stato',r.stato,'motivo',r.motivo); END IF;
  IF r.riservate + p_n > r.max_chiamate THEN RETURN jsonb_build_object('esito','budget','riservate',r.riservate,'max',r.max_chiamate); END IF;
  SELECT COALESCE(sum(riservate),0) INTO v_usate FROM public.ia_backtest_run WHERE user_id = p_user AND created_at > now() - interval '24 hours';
  IF v_usate + p_n > 300 THEN RETURN jsonb_build_object('esito','budget','motivo','limite giornaliero'); END IF;
  INSERT INTO public.ia_backtest_chiamate(run_id, user_id, chiave, tipo, riservate) VALUES (p_run, p_user, p_chiave, p_tipo, p_n);
  UPDATE public.ia_backtest_run SET riservate = riservate + p_n, updated_at = now() WHERE id = p_run;
  RETURN jsonb_build_object('esito','riservata','riservate',r.riservate + p_n,'max',r.max_chiamate);
END $$;
REVOKE ALL ON FUNCTION public.ia_backtest_riserva(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_backtest_riserva(uuid, uuid, text, text, integer) TO service_role;