-- Veterinarians may consult colleagues and their agendas. Keep write, compensation,
-- settlement, branch and per-user restriction permissions unchanged.
CREATE OR REPLACE FUNCTION public.role_permissions(p_role public.user_role)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN public.permission_catalog()
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay',
      'interconsultations:read','interconsultations:write','interconsultations:approve','interconsultations:billing'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export','waiting_room:read','waiting_room:write','professionals:read',
      'interconsultations:read','interconsultations:write'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'interconsultations:read'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send','waiting_room:read','waiting_room:write',
      'interconsultations:read'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'professional_settlements:read','professional_settlements:pay',
      'interconsultations:read','interconsultations:billing'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read','waiting_room:read',
      'interconsultations:read'
    ]
    ELSE ARRAY[]::TEXT[]
  END;
$$;
