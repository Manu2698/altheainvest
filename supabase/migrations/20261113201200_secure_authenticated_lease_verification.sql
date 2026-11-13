-- Allow the authenticated owner to renew only their own account lease.
-- Keep SECURITY DEFINER because lease_conti is intentionally not directly writable
-- by the browser role; bind the RPC to auth.uid() to prevent cross-user access.
CREATE OR REPLACE FUNCTION public.verifica_lease_conto(
  p_user uuid,
  p_piattaforma text,
  p_ambiente text,
  p_proprietario uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'Unauthorized lease verification';
  END IF;

  UPDATE public.lease_conti
  SET scade_il = now() + interval '10 minutes'
  WHERE user_id = p_user
    AND piattaforma = p_piattaforma
    AND ambiente = p_ambiente
    AND proprietario = p_proprietario
    AND scade_il > now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.verifica_lease_conto(uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verifica_lease_conto(uuid,text,text,uuid)
  TO authenticated, service_role;
