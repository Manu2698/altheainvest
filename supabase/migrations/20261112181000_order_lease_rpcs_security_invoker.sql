-- These functions operate only on rows protected by owner_isolation RLS.
-- SECURITY INVOKER ensures the authenticated caller remains subject to RLS.
ALTER FUNCTION public.prendi_lease_conto(uuid, text, text, uuid) SECURITY INVOKER;
ALTER FUNCTION public.prepara_intento_ordine(uuid, text, text, uuid, text, text, text, text, text, numeric) SECURITY INVOKER;
