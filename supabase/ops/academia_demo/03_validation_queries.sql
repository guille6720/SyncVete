-- Read-only validation after a future authorized seed.
SELECT json_build_object(
  'demo_orgs', (
    SELECT count(*) FROM public.organizations WHERE name ILIKE 'Academia Demo%'
  ),
  'demo_appointments', (
    SELECT count(*)
    FROM public.appointments a
    JOIN public.organizations o ON o.id = a.organization_id
    WHERE o.name ILIKE 'Academia Demo%'
      AND a.deleted_at IS NULL
  ),
  'foreign_leak_check', (
    SELECT count(*)
    FROM public.appointments a
    JOIN public.organizations o ON o.id = a.organization_id
    WHERE o.name ILIKE 'Academia Demo%'
      AND a.organization_id <> o.id
  )
) AS academia_demo_validation;
