-- Staging ops: inspect founder/role mismatches (read-only).
-- Run in SyncVete-Staging SQL editor after applying 20260916180000_*.

-- 1) Remaining orgs without owner (manual review)
-- SELECT * FROM public.ops_orgs_missing_owner ORDER BY created_at;

-- 2) Memberships that are non-owner on main branch while being the earliest profile
--    (already repaired by migration when org had zero owners; leftover = ambiguous)
/*
SELECT
  o.slug,
  p.full_name,
  bm.role,
  bm.permissions,
  bm.branch_id,
  p.active_branch_id,
  bm.created_at AS membership_created_at,
  p.created_at AS profile_created_at
FROM public.organizations o
JOIN public.profiles p ON p.organization_id = o.id AND p.deleted_at IS NULL
JOIN public.branch_members bm
  ON bm.user_id = p.id
 AND bm.organization_id = o.id
 AND bm.is_active
 AND bm.deleted_at IS NULL
WHERE o.deleted_at IS NULL
  AND bm.role <> 'owner'
  AND p.created_at = (
    SELECT MIN(p2.created_at)
    FROM public.profiles p2
    WHERE p2.organization_id = o.id AND p2.deleted_at IS NULL
  )
ORDER BY o.slug, bm.created_at;
*/

SELECT 'See comments in this file for staging inspection queries' AS note;
