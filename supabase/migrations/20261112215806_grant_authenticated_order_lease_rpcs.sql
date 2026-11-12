-- Authenticated requests use the caller JWT and must execute the guarded
-- lease functions. Each function independently checks auth.uid() against p_user.
GRANT EXECUTE ON FUNCTION public.prendi_lease_conto(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepara_intento_ordine(uuid, text, text, uuid, text, text, text, text, text, numeric) TO authenticated;
