CREATE TABLE IF NOT EXISTS public.progrowth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phase INTEGER NOT NULL DEFAULT 1,
  phase1_document TEXT,
  phase2_document TEXT,
  final_document TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.progrowth_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_clients" ON public.progrowth_clients
  FOR ALL USING (user_id = auth.uid()::text);
