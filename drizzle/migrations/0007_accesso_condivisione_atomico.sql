CREATE OR REPLACE FUNCTION public.registra_accesso_condivisione(p_id uuid, p_finestra_secondi integer, p_massimo integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.link_condivisione SET
    finestra_inizio = CASE WHEN finestra_inizio IS NULL OR now() - finestra_inizio > make_interval(secs => p_finestra_secondi) THEN now() ELSE finestra_inizio END,
    accessi_finestra = CASE WHEN finestra_inizio IS NULL OR now() - finestra_inizio > make_interval(secs => p_finestra_secondi) THEN 1 ELSE accessi_finestra + 1 END,
    accessi = accessi + 1,
    ultimo_accesso = now()
  WHERE id = p_id
    AND (finestra_inizio IS NULL OR now() - finestra_inizio > make_interval(secs => p_finestra_secondi) OR accessi_finestra < p_massimo);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.registra_accesso_condivisione(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_accesso_condivisione(uuid, integer, integer) TO service_role;