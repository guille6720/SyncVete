-- Platform access is assigned separately through the protected platform_admins table.
-- Only the current platform admin's own clinic is exempt from this administrative quota.
-- Ordinary clinics, explicit user restrictions and tenant policies retain their behavior.
CREATE OR REPLACE FUNCTION public.managed_user_limit(p_organization_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_platform_admin()
      AND p_organization_id = public.get_user_organization_id()
      THEN NULL::INTEGER
    ELSE COALESCE(
      (SELECT s.managed_user_limit FROM public.managed_user_settings s
       WHERE s.organization_id = p_organization_id),
      10
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.managed_user_limit(UUID) FROM PUBLIC, anon, authenticated;
