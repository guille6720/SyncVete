-- Soft-delete of owners was a no-op when the UPDATE policy reused
-- `deleted_at IS NULL` as the new-row check. PostgREST then reported success
-- and the owner stayed in the list and kept working.

DROP POLICY IF EXISTS owners_update_tenant ON public.owners;

CREATE POLICY owners_update_tenant ON public.owners
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('patients:write')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('patients:write')
  );

CREATE OR REPLACE FUNCTION public.soft_delete_owner(p_owner_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id();
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.has_permission('patients:write') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.owners
  SET deleted_at = now(), is_active = false
  WHERE id = p_owner_id
    AND organization_id = v_org
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner not found';
  END IF;

  RETURN p_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_owner(uuid) TO authenticated;
