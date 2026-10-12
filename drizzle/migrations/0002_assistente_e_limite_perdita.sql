ALTER TABLE public.automazioni_ia
  ADD COLUMN IF NOT EXISTS perdita_max_giornaliera numeric,
  ADD COLUMN IF NOT EXISTS pausa_motivo text,
  ADD COLUMN IF NOT EXISTS pausa_il timestamptz;

CREATE TABLE public.chat_thread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titolo text NOT NULL DEFAULT 'Nuova conversazione',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_thread TO authenticated;
GRANT ALL ON public.chat_thread TO service_role;
ALTER TABLE public.chat_thread ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.chat_thread FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX chat_thread_user_idx ON public.chat_thread(user_id, updated_at DESC);

CREATE TABLE public.chat_messaggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_thread(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sdk_id text NOT NULL,
  ruolo text NOT NULL,
  messaggio jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, sdk_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messaggi TO authenticated;
GRANT ALL ON public.chat_messaggi TO service_role;
ALTER TABLE public.chat_messaggi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.chat_messaggi FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX chat_messaggi_thread_idx ON public.chat_messaggi(thread_id, created_at);