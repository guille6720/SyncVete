-- SELECT policies keep archived clinical content hidden. A narrow, authorized
-- operation performs soft deletion without exposing archived rows or disabling RLS.
CREATE OR REPLACE FUNCTION public.soft_delete_clinical_entry(p_entry_id UUID)
RETURNS TABLE(id UUID, patient_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL
    OR NOT public.has_permission('clinical:read')
    OR NOT public.has_permission('clinical:write') THEN
    RAISE EXCEPTION 'CLINICAL_ENTRY_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.clinical_entries AS ce
  SET deleted_at = now()
  WHERE ce.id = p_entry_id
    AND ce.organization_id = v_org
    AND ce.deleted_at IS NULL
    AND public.user_has_branch_access(ce.branch_id)
  RETURNING ce.id, ce.patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLINICAL_ENTRY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_clinical_entry(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_clinical_entry(UUID) TO authenticated;
