-- Waiting Room Phase 1: operational queue layer on top of appointments.
-- STAGING FIRST. Additive. Does NOT extend appointment_status.
-- appointments remains the source of truth for scheduled visits.

-- ─────────────────────────────────────────────
-- Enum (separate from appointment_status)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waiting_room_status') THEN
    CREATE TYPE public.waiting_room_status AS ENUM (
      'waiting',
      'called',
      'in_consultation',
      'payment_pending',
      'completed'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Permissions: waiting_room:read / waiting_room:write
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.user_role;
  custom_perms JSONB;
  role_perms TEXT[];
BEGIN
  SELECT bm.role, bm.permissions
  INTO user_role, custom_perms
  FROM public.branch_members bm
  WHERE bm.user_id = auth.uid()
    AND bm.deleted_at IS NULL
    AND bm.is_active = true
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  IF custom_perms IS NOT NULL AND jsonb_array_length(custom_perms) > 0 THEN
    RETURN custom_perms ? required_permission;
  END IF;

  role_perms := CASE user_role
    WHEN 'owner' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write'
    ]
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export','waiting_room:read','waiting_room:write'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read','waiting_room:write'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send','waiting_room:read','waiting_room:write'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send',
      'waiting_room:read','waiting_room:write'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read','waiting_room:read'
    ]
    ELSE ARRAY[]::TEXT[]
  END;

  RETURN required_permission = ANY(role_perms);
END;
$$;

-- ─────────────────────────────────────────────
-- Feature catalog (backward-compatible: enabled by default + all plans)
-- ─────────────────────────────────────────────
INSERT INTO public.features (key, name, description, feature_type, default_enabled, usage_metered)
VALUES (
  'waiting_room.enabled',
  'Sala de espera',
  'Cola operativa de sala de espera vinculada a citas',
  'boolean',
  true,
  false
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_enabled = EXCLUDED.default_enabled,
  usage_metered = EXCLUDED.usage_metered,
  is_active = true,
  updated_at = now();

INSERT INTO public.plan_features (plan_id, feature_id, enabled, limit_value)
SELECT p.id, f.id, true, NULL
FROM public.plans p
CROSS JOIN public.features f
WHERE p.is_active
  AND f.key = 'waiting_room.enabled'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();

-- ─────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waiting_room_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  status public.waiting_room_status NOT NULL DEFAULT 'waiting',
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  consultation_started_at TIMESTAMPTZ,
  payment_pending_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  queue_position INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  room TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- One non-deleted Waiting Room entry per appointment
CREATE UNIQUE INDEX IF NOT EXISTS uq_waiting_room_entries_active_appointment
  ON public.waiting_room_entries (appointment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_waiting_room_entries_org_branch_status
  ON public.waiting_room_entries (organization_id, branch_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_waiting_room_entries_branch_queue
  ON public.waiting_room_entries (branch_id, priority DESC, queue_position ASC NULLS LAST, checked_in_at ASC)
  WHERE deleted_at IS NULL AND status <> 'completed';

CREATE INDEX IF NOT EXISTS idx_waiting_room_entries_checked_in
  ON public.waiting_room_entries (organization_id, branch_id, checked_in_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_waiting_room_entries_appointment
  ON public.waiting_room_entries (appointment_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_waiting_room_entries_updated_at
  BEFORE UPDATE ON public.waiting_room_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_waiting_room_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.waiting_room_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.waiting_room_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_room_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waiting_room_entries_select_tenant ON public.waiting_room_entries;
CREATE POLICY waiting_room_entries_select_tenant ON public.waiting_room_entries
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('waiting_room:read')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS waiting_room_entries_insert_tenant ON public.waiting_room_entries;
CREATE POLICY waiting_room_entries_insert_tenant ON public.waiting_room_entries
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('waiting_room:write')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS waiting_room_entries_update_tenant ON public.waiting_room_entries;
CREATE POLICY waiting_room_entries_update_tenant ON public.waiting_room_entries
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('waiting_room:write')
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('waiting_room:write')
    AND public.user_has_branch_access(branch_id)
  );

-- Realtime preparation (RLS remains mandatory)
ALTER TABLE public.waiting_room_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'waiting_room_entries'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.waiting_room_entries;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.waiting_room_is_valid_transition(
  p_from public.waiting_room_status,
  p_to public.waiting_room_status
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = 'waiting' AND p_to = 'called' THEN true
    WHEN p_from = 'called' AND p_to = 'in_consultation' THEN true
    WHEN p_from = 'in_consultation' AND p_to = 'payment_pending' THEN true
    WHEN p_from = 'payment_pending' AND p_to = 'completed' THEN true
    ELSE false
  END;
$$;

-- ─────────────────────────────────────────────
-- RPC: check_in_appointment
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_appt public.appointments%ROWTYPE;
  v_next_pos INTEGER;
  v_entry public.waiting_room_entries%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para check-in en sala de espera';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id requerido';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_appt.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la cita';
  END IF;

  IF v_appt.status = 'cancelada' THEN
    RAISE EXCEPTION 'No se puede hacer check-in de una cita cancelada';
  END IF;

  IF v_appt.status = 'completada' THEN
    RAISE EXCEPTION 'No se puede hacer check-in de una cita completada';
  END IF;

  IF v_appt.status = 'ausente' THEN
    RAISE EXCEPTION 'No se puede hacer check-in de una cita marcada ausente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.waiting_room_entries w
    WHERE w.appointment_id = v_appt.id
      AND w.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La cita ya tiene una entrada activa en sala de espera';
  END IF;

  -- Serialize queue_position assignment per branch
  PERFORM pg_advisory_xact_lock(hashtext(v_appt.branch_id::text));

  SELECT COALESCE(MAX(w.queue_position), 0) + 1
  INTO v_next_pos
  FROM public.waiting_room_entries w
  WHERE w.organization_id = v_org_id
    AND w.branch_id = v_appt.branch_id
    AND w.deleted_at IS NULL
    AND w.status <> 'completed';

  INSERT INTO public.waiting_room_entries (
    organization_id,
    branch_id,
    appointment_id,
    status,
    checked_in_at,
    queue_position,
    priority,
    created_by
  ) VALUES (
    v_org_id,
    v_appt.branch_id,
    v_appt.id,
    'waiting',
    now(),
    v_next_pos,
    0,
    auth.uid()
  )
  RETURNING * INTO v_entry;

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'organization_id', v_entry.organization_id,
    'branch_id', v_entry.branch_id,
    'appointment_id', v_entry.appointment_id,
    'status', v_entry.status,
    'checked_in_at', v_entry.checked_in_at,
    'called_at', v_entry.called_at,
    'consultation_started_at', v_entry.consultation_started_at,
    'payment_pending_at', v_entry.payment_pending_at,
    'completed_at', v_entry.completed_at,
    'queue_position', v_entry.queue_position,
    'priority', v_entry.priority,
    'room', v_entry.room,
    'created_by', v_entry.created_by,
    'created_at', v_entry.created_at,
    'updated_at', v_entry.updated_at
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La cita ya tiene una entrada activa en sala de espera';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_appointment(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: list_waiting_room
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_waiting_room(
  p_branch_id UUID DEFAULT NULL,
  p_date DATE DEFAULT NULL
)
RETURNS TABLE (
  waiting_room_entry_id UUID,
  appointment_id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_id UUID,
  owner_full_name TEXT,
  assigned_user_id UUID,
  assigned_user_name TEXT,
  appointment_type public.appointment_type,
  appointment_starts_at TIMESTAMPTZ,
  waiting_room_status public.waiting_room_status,
  checked_in_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  consultation_started_at TIMESTAMPTZ,
  payment_pending_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  queue_position INTEGER,
  priority INTEGER,
  room TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  IF p_date IS NOT NULL THEN
    v_day_start := (p_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
    v_day_end := ((p_date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  END IF;

  RETURN QUERY
  SELECT
    w.id AS waiting_room_entry_id,
    a.id AS appointment_id,
    a.patient_id,
    p.name AS patient_name,
    p.species AS patient_species,
    a.owner_id,
    o.full_name AS owner_full_name,
    a.assigned_user_id,
    pr.full_name AS assigned_user_name,
    a.appointment_type,
    a.starts_at AS appointment_starts_at,
    w.status AS waiting_room_status,
    w.checked_in_at,
    w.called_at,
    w.consultation_started_at,
    w.payment_pending_at,
    w.completed_at,
    w.queue_position,
    w.priority,
    w.room
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
  INNER JOIN public.patients p
    ON p.id = a.patient_id
   AND p.deleted_at IS NULL
  INNER JOIN public.owners o
    ON o.id = a.owner_id
   AND o.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = a.assigned_user_id
  WHERE w.organization_id = v_org_id
    AND w.deleted_at IS NULL
    AND public.user_has_branch_access(w.branch_id)
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    AND (
      p_date IS NULL
      OR (w.checked_in_at >= v_day_start AND w.checked_in_at < v_day_end)
    )
  ORDER BY
    w.priority DESC,
    w.queue_position ASC NULLS LAST,
    w.checked_in_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_waiting_room(UUID, DATE) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: update_waiting_room_status
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_waiting_room_status(
  p_entry_id UUID,
  p_new_status public.waiting_room_status,
  p_room TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_entry public.waiting_room_entries%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para actualizar sala de espera';
  END IF;

  IF p_entry_id IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'entry_id y new_status son requeridos';
  END IF;

  SELECT * INTO v_entry
  FROM public.waiting_room_entries
  WHERE id = p_entry_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada de sala de espera no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_entry.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la entrada';
  END IF;

  IF v_entry.status = p_new_status THEN
    IF p_room IS NOT NULL THEN
      UPDATE public.waiting_room_entries
      SET room = NULLIF(btrim(p_room), '')
      WHERE id = v_entry.id
      RETURNING * INTO v_entry;
    END IF;

    RETURN jsonb_build_object(
      'id', v_entry.id,
      'appointment_id', v_entry.appointment_id,
      'status', v_entry.status,
      'called_at', v_entry.called_at,
      'consultation_started_at', v_entry.consultation_started_at,
      'payment_pending_at', v_entry.payment_pending_at,
      'completed_at', v_entry.completed_at,
      'queue_position', v_entry.queue_position,
      'priority', v_entry.priority,
      'room', v_entry.room
    );
  END IF;

  IF NOT public.waiting_room_is_valid_transition(v_entry.status, p_new_status) THEN
    RAISE EXCEPTION 'Transición de estado inválida: % → %', v_entry.status, p_new_status;
  END IF;

  UPDATE public.waiting_room_entries
  SET
    status = p_new_status,
    room = CASE
      WHEN p_room IS NULL THEN room
      ELSE NULLIF(btrim(p_room), '')
    END,
    called_at = CASE
      WHEN p_new_status = 'called' THEN COALESCE(called_at, v_now)
      ELSE called_at
    END,
    consultation_started_at = CASE
      WHEN p_new_status = 'in_consultation' THEN COALESCE(consultation_started_at, v_now)
      ELSE consultation_started_at
    END,
    payment_pending_at = CASE
      WHEN p_new_status = 'payment_pending' THEN COALESCE(payment_pending_at, v_now)
      ELSE payment_pending_at
    END,
    completed_at = CASE
      WHEN p_new_status = 'completed' THEN COALESCE(completed_at, v_now)
      ELSE completed_at
    END
  WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  IF p_new_status = 'in_consultation' THEN
    UPDATE public.appointments
    SET status = 'en_curso'
    WHERE id = v_entry.appointment_id
      AND organization_id = v_org_id
      AND deleted_at IS NULL
      AND status IN ('programada', 'confirmada');
  ELSIF p_new_status = 'completed' THEN
    UPDATE public.appointments
    SET status = 'completada'
    WHERE id = v_entry.appointment_id
      AND organization_id = v_org_id
      AND deleted_at IS NULL
      AND status NOT IN ('cancelada', 'ausente', 'completada');
  END IF;

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'appointment_id', v_entry.appointment_id,
    'status', v_entry.status,
    'called_at', v_entry.called_at,
    'consultation_started_at', v_entry.consultation_started_at,
    'payment_pending_at', v_entry.payment_pending_at,
    'completed_at', v_entry.completed_at,
    'queue_position', v_entry.queue_position,
    'priority', v_entry.priority,
    'room', v_entry.room
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_waiting_room_status(UUID, public.waiting_room_status, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: reorder_waiting_room
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_waiting_room(
  p_entry_id UUID,
  p_queue_position INTEGER DEFAULT NULL,
  p_priority INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_entry public.waiting_room_entries%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para reordenar sala de espera';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'entry_id requerido';
  END IF;

  IF p_queue_position IS NULL AND p_priority IS NULL THEN
    RAISE EXCEPTION 'Debés indicar queue_position y/o priority';
  END IF;

  IF p_queue_position IS NOT NULL AND p_queue_position < 1 THEN
    RAISE EXCEPTION 'queue_position debe ser >= 1';
  END IF;

  SELECT * INTO v_entry
  FROM public.waiting_room_entries
  WHERE id = p_entry_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada de sala de espera no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_entry.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la entrada';
  END IF;

  IF v_entry.status = 'completed' THEN
    RAISE EXCEPTION 'No se puede reordenar una entrada completada';
  END IF;

  UPDATE public.waiting_room_entries
  SET
    queue_position = COALESCE(p_queue_position, queue_position),
    priority = COALESCE(p_priority, priority)
  WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'appointment_id', v_entry.appointment_id,
    'status', v_entry.status,
    'queue_position', v_entry.queue_position,
    'priority', v_entry.priority,
    'room', v_entry.room
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_waiting_room(UUID, INTEGER, INTEGER) TO authenticated;
