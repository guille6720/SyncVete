-- Log of team-access notification emails (rate-limit + ops). Staging first.
-- Does not store tokens, passwords, or SMTP secrets.

CREATE TABLE IF NOT EXISTS public.team_access_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('existing_access', 'new_invite')),
  provider TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT false,
  provider_message_id TEXT,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_access_email_log_rate
  ON public.team_access_email_log (organization_id, lower(recipient_email), message_type, created_at DESC);

ALTER TABLE public.team_access_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_access_email_log_select ON public.team_access_email_log;
CREATE POLICY team_access_email_log_select ON public.team_access_email_log
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('users:manage')
  );

DROP POLICY IF EXISTS team_access_email_log_insert ON public.team_access_email_log;
CREATE POLICY team_access_email_log_insert ON public.team_access_email_log
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('users:manage')
  );

REVOKE ALL ON public.team_access_email_log FROM PUBLIC;
GRANT SELECT, INSERT ON public.team_access_email_log TO authenticated;
GRANT ALL ON public.team_access_email_log TO service_role;

COMMENT ON TABLE public.team_access_email_log IS
  'Server-side log of clinic access notification emails for rate limiting and ops. No secrets.';
