-- Fix soft-delete of appointments blocked by RLS.
-- Postgres UPDATE policies default WITH CHECK = USING; with
-- `deleted_at IS NULL` in USING, setting deleted_at fails the check.
-- Reversible: restore prior policy without explicit WITH CHECK.

DROP POLICY IF EXISTS appointments_update_tenant ON public.appointments;

CREATE POLICY appointments_update_tenant ON public.appointments
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:write')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
  );

COMMENT ON POLICY appointments_update_tenant ON public.appointments IS
  'Allow soft-delete (deleted_at) while keeping tenant + write permission checks.';
