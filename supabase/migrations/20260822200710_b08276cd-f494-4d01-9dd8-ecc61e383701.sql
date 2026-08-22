CREATE TABLE public.event_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  livello text NOT NULL DEFAULT 'error',
  origine text NOT NULL,
  tipo text NOT NULL DEFAULT 'Error',
  messaggio text NOT NULL,
  stack text,
  contesto jsonb,
  ambiente text,
  url text,
  user_agent text
);

CREATE INDEX event_log_created_at_idx ON public.event_log (created_at DESC);
CREATE INDEX event_log_origine_idx ON public.event_log (origine);

GRANT ALL ON public.event_log TO service_role;

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;