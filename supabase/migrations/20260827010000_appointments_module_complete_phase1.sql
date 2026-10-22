-- Appointments Module Complete Phase 1: schedules, time blocks, waitlist, status events, reminders.
-- STAGING FIRST. Additive only.
-- Does NOT ALTER appointment_status (programada/confirmada/en_curso/completada/cancelada/ausente).
-- Does NOT weaken RLS.

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_mode') THEN
    CREATE TYPE public.consultation_mode AS ENUM (
      'clinic',
      'home_visit',
      'video'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_block_kind') THEN
    CREATE TYPE public.time_block_kind AS ENUM (
      'break',
      'vacation',
      'blocked'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE public.waitlist_status AS ENUM (
      'open',
      'offered',
      'booked',
      'cancelled',
      'expired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_job_kind') THEN
    CREATE TYPE public.reminder_job_kind AS ENUM (
      'confirmation',
      'remind_24h',
      'remind_2h',
      'cancellation',
      'reschedule',
      'professional_notify'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_job_status') THEN
    CREATE TYPE public.reminder_job_status AS ENUM (
      'pending',
      'due',
      'sent',
      'skipped',
      'failed',
      'cancelled'
    );
  END IF;
END $$;

-- schedule_weekday: prefer smallint 1=Monday .. 7=Sunday (ISO / EXTRACT(ISODOW)), matching professional_schedules.weekday

-- ─────────────────────────────────────────────
-- ALTER appointments (additive columns)
-- ─────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS consultation_mode public.consultation_mode NULL,
  ADD COLUMN IF NOT EXISTS expected_payment_method TEXT NULL,
  ADD COLUMN IF NOT EXISTS room TEXT NULL,
  ADD COLUMN IF NOT EXISTS remind_24h BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remind_2h BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remind_confirmation BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'appointments'
      AND c.conname = 'appointments_expected_payment_method_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_expected_payment_method_check
      CHECK (
        expected_payment_method IS NULL
        OR expected_payment_method IN (
          'efectivo',
          'transferencia',
          'tarjeta',
          'mercadopago',
          'otro'
        )
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Table: professional_schedules
-- weekday: 1=Monday .. 7=Sunday (ISODOW)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 1=Monday .. 7=Sunday (ISO / EXTRACT(ISODOW FROM ts))
  weekday SMALLINT NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0),
  allowed_appointment_types public.appointment_type[] NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (end_time > start_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_schedules_active_window
  ON public.professional_schedules (organization_id, branch_id, user_id, weekday, start_time)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_schedules_lookup
  ON public.professional_schedules (organization_id, branch_id, user_id, weekday)
  WHERE deleted_at IS NULL AND is_active = true;

DROP TRIGGER IF EXISTS trg_professional_schedules_updated_at ON public.professional_schedules;
CREATE TRIGGER trg_professional_schedules_updated_at
  BEFORE UPDATE ON public.professional_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_schedules ON public.professional_schedules;
CREATE TRIGGER trg_audit_professional_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_schedules
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_schedules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_schedules_select_tenant ON public.professional_schedules;
CREATE POLICY professional_schedules_select_tenant ON public.professional_schedules
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:read')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS professional_schedules_insert_tenant ON public.professional_schedules;
CREATE POLICY professional_schedules_insert_tenant ON public.professional_schedules
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS professional_schedules_update_tenant ON public.professional_schedules;
CREATE POLICY professional_schedules_update_tenant ON public.professional_schedules
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  );

-- ─────────────────────────────────────────────
-- Table: professional_time_blocks
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  -- NULL user_id = branch-wide block
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.time_block_kind NOT NULL DEFAULT 'blocked',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_professional_time_blocks_overlap
  ON public.professional_time_blocks (organization_id, branch_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_time_blocks_user
  ON public.professional_time_blocks (organization_id, branch_id, user_id, starts_at)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_professional_time_blocks_updated_at ON public.professional_time_blocks;
CREATE TRIGGER trg_professional_time_blocks_updated_at
  BEFORE UPDATE ON public.professional_time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_time_blocks ON public.professional_time_blocks;
CREATE TRIGGER trg_audit_professional_time_blocks
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.professional_time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_time_blocks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_time_blocks_select_tenant ON public.professional_time_blocks;
CREATE POLICY professional_time_blocks_select_tenant ON public.professional_time_blocks
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:read')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS professional_time_blocks_insert_tenant ON public.professional_time_blocks;
CREATE POLICY professional_time_blocks_insert_tenant ON public.professional_time_blocks
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS professional_time_blocks_update_tenant ON public.professional_time_blocks;
CREATE POLICY professional_time_blocks_update_tenant ON public.professional_time_blocks
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  );

-- ─────────────────────────────────────────────
-- Table: appointment_waitlist
-- preferred_weekdays: 1=Monday .. 7=Sunday
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  preferred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_type public.appointment_type NOT NULL DEFAULT 'consulta',
  preferred_weekdays SMALLINT[] NULL,
  preferred_time_start TIME NULL,
  preferred_time_end TIME NULL,
  priority INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  status public.waitlist_status NOT NULL DEFAULT 'open',
  matched_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    preferred_time_start IS NULL
    OR preferred_time_end IS NULL
    OR preferred_time_end > preferred_time_start
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_status
  ON public.appointment_waitlist (organization_id, branch_id, status, priority DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_open
  ON public.appointment_waitlist (organization_id, branch_id, appointment_type, preferred_user_id)
  WHERE deleted_at IS NULL AND status = 'open';

DROP TRIGGER IF EXISTS trg_appointment_waitlist_updated_at ON public.appointment_waitlist;
CREATE TRIGGER trg_appointment_waitlist_updated_at
  BEFORE UPDATE ON public.appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_appointment_waitlist ON public.appointment_waitlist;
CREATE TRIGGER trg_audit_appointment_waitlist
  AFTER INSERT OR UPDATE OR DELETE ON public.appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_waitlist FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_waitlist_select_tenant ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_select_tenant ON public.appointment_waitlist
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:read')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS appointment_waitlist_insert_tenant ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_insert_tenant ON public.appointment_waitlist
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS appointment_waitlist_update_tenant ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_update_tenant ON public.appointment_waitlist
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
    AND public.user_has_branch_access(branch_id)
  );

-- ─────────────────────────────────────────────
-- Table: appointment_status_events (append-only)
-- No soft delete. INSERT via trigger / SECURITY DEFINER only.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  from_status public.appointment_status NULL,
  to_status public.appointment_status NOT NULL,
  previous_starts_at TIMESTAMPTZ NULL,
  previous_ends_at TIMESTAMPTZ NULL,
  new_starts_at TIMESTAMPTZ NULL,
  new_ends_at TIMESTAMPTZ NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_status_events_appointment
  ON public.appointment_status_events (appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_status_events_org
  ON public.appointment_status_events (organization_id, created_at DESC);

ALTER TABLE public.appointment_status_events ENABLE ROW LEVEL SECURITY;
-- No FORCE: SECURITY DEFINER trigger (owner) must insert without a client INSERT grant.

DROP POLICY IF EXISTS appointment_status_events_select_tenant ON public.appointment_status_events;
CREATE POLICY appointment_status_events_select_tenant ON public.appointment_status_events
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:read')
  );

REVOKE ALL ON TABLE public.appointment_status_events FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.appointment_status_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.appointment_status_events TO authenticated;

-- ─────────────────────────────────────────────
-- Table: appointment_reminder_jobs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_reminder_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind public.reminder_job_kind NOT NULL,
  status public.reminder_job_status NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_reminder_jobs_active_kind
  ON public.appointment_reminder_jobs (appointment_id, kind)
  WHERE status IN ('pending', 'due') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_reminder_jobs_due
  ON public.appointment_reminder_jobs (scheduled_for, status)
  WHERE deleted_at IS NULL AND status IN ('pending', 'due');

CREATE INDEX IF NOT EXISTS idx_appointment_reminder_jobs_appointment
  ON public.appointment_reminder_jobs (appointment_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_appointment_reminder_jobs_updated_at ON public.appointment_reminder_jobs;
CREATE TRIGGER trg_appointment_reminder_jobs_updated_at
  BEFORE UPDATE ON public.appointment_reminder_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.appointment_reminder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminder_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_reminder_jobs_select_tenant ON public.appointment_reminder_jobs;
CREATE POLICY appointment_reminder_jobs_select_tenant ON public.appointment_reminder_jobs
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('appointments:read')
  );

-- INSERT policy for SECURITY DEFINER enqueue (FORCE RLS). Clients have no INSERT grant.
DROP POLICY IF EXISTS appointment_reminder_jobs_insert_tenant ON public.appointment_reminder_jobs;
CREATE POLICY appointment_reminder_jobs_insert_tenant ON public.appointment_reminder_jobs
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('appointments:write')
  );

-- Writes go through SECURITY DEFINER RPCs (enqueue); no direct INSERT/UPDATE for clients.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.appointment_reminder_jobs FROM anon, authenticated;

-- Overlap helper index on appointments
CREATE INDEX IF NOT EXISTS idx_appointments_assignee_overlap
  ON public.appointments (organization_id, assigned_user_id, starts_at, ends_at)
  WHERE deleted_at IS NULL
    AND assigned_user_id IS NOT NULL
    AND status NOT IN ('cancelada', 'ausente');

-- ─────────────────────────────────────────────
-- Function: appointment_has_overlap
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_has_overlap(
  p_organization_id UUID,
  p_assigned_user_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_organization_id IS NULL
     OR p_assigned_user_id IS NULL
     OR p_starts_at IS NULL
     OR p_ends_at IS NULL
     OR p_ends_at <= p_starts_at THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.organization_id = p_organization_id
      AND a.assigned_user_id = p_assigned_user_id
      AND a.deleted_at IS NULL
      AND a.status NOT IN ('cancelada', 'ausente')
      AND (p_exclude_id IS NULL OR a.id <> p_exclude_id)
      AND a.starts_at < p_ends_at
      AND a.ends_at > p_starts_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.appointment_has_overlap(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appointment_has_overlap(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- Trigger: status events (append-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_appointments_status_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.appointment_status_events (
      organization_id,
      appointment_id,
      from_status,
      to_status,
      previous_starts_at,
      previous_ends_at,
      new_starts_at,
      new_ends_at,
      changed_by
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      NULL,
      NEW.status,
      NULL,
      NULL,
      NEW.starts_at,
      NEW.ends_at,
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
      INSERT INTO public.appointment_status_events (
        organization_id,
        appointment_id,
        from_status,
        to_status,
        previous_starts_at,
        previous_ends_at,
        new_starts_at,
        new_ends_at,
        changed_by
      ) VALUES (
        NEW.organization_id,
        NEW.id,
        OLD.status,
        NEW.status,
        OLD.starts_at,
        OLD.ends_at,
        NEW.starts_at,
        NEW.ends_at,
        auth.uid()
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_status_events ON public.appointments;
CREATE TRIGGER trg_appointments_status_events
  AFTER INSERT OR UPDATE OF status, starts_at, ends_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_appointments_status_events();

REVOKE ALL ON FUNCTION public.trg_fn_appointments_status_events() FROM PUBLIC;

-- ─────────────────────────────────────────────
-- Trigger: availability (overlap + blocks + schedules)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_appointments_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_start TIMESTAMP;
  v_local_end TIMESTAMP;
  v_weekday SMALLINT;
  v_start_time TIME;
  v_end_time TIME;
  v_has_schedules BOOLEAN;
BEGIN
  -- Soft-delete or inactive statuses do not block the calendar
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelada', 'ausente') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Horario inválido: ends_at debe ser posterior a starts_at';
  END IF;

  -- Overlapping appointments
  IF public.appointment_has_overlap(
    NEW.organization_id,
    NEW.assigned_user_id,
    NEW.starts_at,
    NEW.ends_at,
    NEW.id
  ) THEN
    RAISE EXCEPTION 'Horario no disponible: el profesional ya tiene una cita en ese rango';
  END IF;

  -- Time blocks (user-specific or branch-wide user_id NULL)
  IF EXISTS (
    SELECT 1
    FROM public.professional_time_blocks b
    WHERE b.organization_id = NEW.organization_id
      AND b.branch_id = NEW.branch_id
      AND b.deleted_at IS NULL
      AND (b.user_id IS NULL OR b.user_id = NEW.assigned_user_id)
      AND b.starts_at < NEW.ends_at
      AND b.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'Horario no disponible: el rango coincide con un bloqueo de agenda';
  END IF;

  -- Opt-in schedules: only enforce when at least one active schedule exists for user+branch
  SELECT EXISTS (
    SELECT 1
    FROM public.professional_schedules s
    WHERE s.organization_id = NEW.organization_id
      AND s.branch_id = NEW.branch_id
      AND s.user_id = NEW.assigned_user_id
      AND s.deleted_at IS NULL
      AND s.is_active = true
  ) INTO v_has_schedules;

  IF NOT v_has_schedules THEN
    RETURN NEW;
  END IF;

  v_local_start := (NEW.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_local_end := (NEW.ends_at AT TIME ZONE 'America/Argentina/Buenos_Aires');

  IF v_local_start::date <> v_local_end::date THEN
    RAISE EXCEPTION 'Horario no disponible: la cita debe quedar dentro de un mismo día de agenda';
  END IF;

  v_weekday := EXTRACT(ISODOW FROM v_local_start)::SMALLINT; -- 1=Mon .. 7=Sun
  v_start_time := v_local_start::TIME;
  v_end_time := v_local_end::TIME;

  IF NOT EXISTS (
    SELECT 1
    FROM public.professional_schedules s
    WHERE s.organization_id = NEW.organization_id
      AND s.branch_id = NEW.branch_id
      AND s.user_id = NEW.assigned_user_id
      AND s.deleted_at IS NULL
      AND s.is_active = true
      AND s.weekday = v_weekday
      AND s.start_time <= v_start_time
      AND s.end_time >= v_end_time
      AND (
        s.allowed_appointment_types IS NULL
        OR NEW.appointment_type = ANY (s.allowed_appointment_types)
      )
  ) THEN
    RAISE EXCEPTION 'Horario no disponible: fuera de la agenda configurada del profesional';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_availability ON public.appointments;
CREATE TRIGGER trg_appointments_availability
  BEFORE INSERT OR UPDATE OF assigned_user_id, branch_id, starts_at, ends_at, status, appointment_type, deleted_at
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_appointments_availability();

REVOKE ALL ON FUNCTION public.trg_fn_appointments_availability() FROM PUBLIC;

-- ─────────────────────────────────────────────
-- list_appointments_range: extend OUT columns (DROP + recreate)
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_appointments_range(DATE, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.list_appointments_range(
  p_week_start DATE,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assigned_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  assigned_user_id UUID,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status public.appointment_status,
  appointment_type public.appointment_type,
  title TEXT,
  notes TEXT,
  cancellation_reason TEXT,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  assigned_user_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  consultation_mode public.consultation_mode,
  room TEXT,
  expected_payment_method TEXT,
  remind_24h BOOLEAN,
  remind_2h BOOLEAN,
  remind_confirmation BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_range_start TIMESTAMPTZ;
  v_range_end TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  v_range_start := (p_week_start::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_range_end := ((p_week_start + 7)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  RETURN QUERY
  SELECT
    a.id,
    a.organization_id,
    a.branch_id,
    a.patient_id,
    a.owner_id,
    a.assigned_user_id,
    a.starts_at,
    a.ends_at,
    a.status,
    a.appointment_type,
    a.title,
    a.notes,
    a.cancellation_reason,
    p.name AS patient_name,
    p.species AS patient_species,
    o.full_name AS owner_full_name,
    pr.full_name AS assigned_user_name,
    a.created_at,
    a.updated_at,
    a.consultation_mode,
    a.room,
    a.expected_payment_method,
    a.remind_24h,
    a.remind_2h,
    a.remind_confirmation
  FROM public.appointments a
  INNER JOIN public.patients p ON p.id = a.patient_id AND p.deleted_at IS NULL
  INNER JOIN public.owners o ON o.id = a.owner_id AND o.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = a.assigned_user_id
  WHERE a.organization_id = v_org_id
    AND a.deleted_at IS NULL
    AND a.starts_at >= v_range_start
    AND a.starts_at < v_range_end
    AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    AND (p_status IS NULL OR btrim(p_status) = '' OR a.status::TEXT = p_status)
    AND (p_assigned_user_id IS NULL OR a.assigned_user_id = p_assigned_user_id)
    AND public.user_has_branch_access(a.branch_id)
  ORDER BY a.starts_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_appointments_range(DATE, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_appointments_range(DATE, UUID, TEXT, UUID) TO authenticated;

-- Calendar range variant (p_from / p_to + optional text query)
CREATE OR REPLACE FUNCTION public.list_appointments_calendar(
  p_from DATE,
  p_to DATE,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assigned_user_id UUID DEFAULT NULL,
  p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  assigned_user_id UUID,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status public.appointment_status,
  appointment_type public.appointment_type,
  title TEXT,
  notes TEXT,
  cancellation_reason TEXT,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  assigned_user_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  consultation_mode public.consultation_mode,
  room TEXT,
  expected_payment_method TEXT,
  remind_24h BOOLEAN,
  remind_2h BOOLEAN,
  remind_confirmation BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_range_start TIMESTAMPTZ;
  v_range_end TIMESTAMPTZ;
  v_q TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from y p_to son requeridos';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to debe ser >= p_from';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  v_range_start := (p_from::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_range_end := ((p_to + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_q := NULLIF(btrim(COALESCE(p_query, '')), '');

  RETURN QUERY
  SELECT
    a.id,
    a.organization_id,
    a.branch_id,
    a.patient_id,
    a.owner_id,
    a.assigned_user_id,
    a.starts_at,
    a.ends_at,
    a.status,
    a.appointment_type,
    a.title,
    a.notes,
    a.cancellation_reason,
    p.name AS patient_name,
    p.species AS patient_species,
    o.full_name AS owner_full_name,
    pr.full_name AS assigned_user_name,
    a.created_at,
    a.updated_at,
    a.consultation_mode,
    a.room,
    a.expected_payment_method,
    a.remind_24h,
    a.remind_2h,
    a.remind_confirmation
  FROM public.appointments a
  INNER JOIN public.patients p ON p.id = a.patient_id AND p.deleted_at IS NULL
  INNER JOIN public.owners o ON o.id = a.owner_id AND o.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = a.assigned_user_id
  WHERE a.organization_id = v_org_id
    AND a.deleted_at IS NULL
    AND a.starts_at >= v_range_start
    AND a.starts_at < v_range_end
    AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    AND (p_status IS NULL OR btrim(p_status) = '' OR a.status::TEXT = p_status)
    AND (p_assigned_user_id IS NULL OR a.assigned_user_id = p_assigned_user_id)
    AND public.user_has_branch_access(a.branch_id)
    AND (
      v_q IS NULL
      OR p.name ILIKE '%' || v_q || '%'
      OR o.full_name ILIKE '%' || v_q || '%'
      OR COALESCE(a.title, '') ILIKE '%' || v_q || '%'
      OR COALESCE(pr.full_name, '') ILIKE '%' || v_q || '%'
      OR COALESCE(a.room, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY a.starts_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_appointments_calendar(DATE, DATE, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_appointments_calendar(DATE, DATE, UUID, TEXT, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: professional schedules
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_professional_schedule(
  p_branch_id UUID,
  p_user_id UUID,
  p_weekday SMALLINT,
  p_start_time TIME,
  p_end_time TIME,
  p_slot_duration_minutes INT DEFAULT 30,
  p_allowed_appointment_types public.appointment_type[] DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true,
  p_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_row public.professional_schedules%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para gestionar agendas';
  END IF;

  IF p_branch_id IS NULL OR p_user_id IS NULL OR p_weekday IS NULL
     OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'branch_id, user_id, weekday, start_time y end_time son requeridos';
  END IF;

  IF p_weekday < 1 OR p_weekday > 7 THEN
    RAISE EXCEPTION 'weekday debe ser 1 (lunes) .. 7 (domingo)';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time debe ser posterior a start_time';
  END IF;

  IF NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.professional_schedules
    SET
      branch_id = p_branch_id,
      user_id = p_user_id,
      weekday = p_weekday,
      start_time = p_start_time,
      end_time = p_end_time,
      slot_duration_minutes = COALESCE(p_slot_duration_minutes, 30),
      allowed_appointment_types = p_allowed_appointment_types,
      is_active = COALESCE(p_is_active, true),
      deleted_at = NULL
    WHERE id = p_id
      AND organization_id = v_org_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agenda no encontrada';
    END IF;
  ELSE
    SELECT * INTO v_row
    FROM public.professional_schedules
    WHERE organization_id = v_org_id
      AND branch_id = p_branch_id
      AND user_id = p_user_id
      AND weekday = p_weekday
      AND start_time = p_start_time
      AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.professional_schedules
      SET
        end_time = p_end_time,
        slot_duration_minutes = COALESCE(p_slot_duration_minutes, 30),
        allowed_appointment_types = p_allowed_appointment_types,
        is_active = COALESCE(p_is_active, true)
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.professional_schedules (
        organization_id,
        branch_id,
        user_id,
        weekday,
        start_time,
        end_time,
        slot_duration_minutes,
        allowed_appointment_types,
        is_active
      ) VALUES (
        v_org_id,
        p_branch_id,
        p_user_id,
        p_weekday,
        p_start_time,
        p_end_time,
        COALESCE(p_slot_duration_minutes, 30),
        p_allowed_appointment_types,
        COALESCE(p_is_active, true)
      )
      RETURNING * INTO v_row;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organization_id', v_row.organization_id,
    'branch_id', v_row.branch_id,
    'user_id', v_row.user_id,
    'weekday', v_row.weekday,
    'start_time', v_row.start_time,
    'end_time', v_row.end_time,
    'slot_duration_minutes', v_row.slot_duration_minutes,
    'allowed_appointment_types', to_jsonb(v_row.allowed_appointment_types),
    'is_active', v_row.is_active,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_professional_schedule(UUID, UUID, SMALLINT, TIME, TIME, INT, public.appointment_type[], BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_professional_schedule(UUID, UUID, SMALLINT, TIME, TIME, INT, public.appointment_type[], BOOLEAN, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_professional_schedules(
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.professional_schedules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.*
  FROM public.professional_schedules s
  WHERE s.organization_id = v_org_id
    AND s.deleted_at IS NULL
    AND public.user_has_branch_access(s.branch_id)
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    AND (p_user_id IS NULL OR s.user_id = p_user_id)
  ORDER BY s.user_id, s.weekday, s.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.list_professional_schedules(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_professional_schedules(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_professional_schedule(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_branch UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para eliminar agendas';
  END IF;

  SELECT branch_id INTO v_branch
  FROM public.professional_schedules
  WHERE id = p_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'Agenda no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_branch) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  UPDATE public.professional_schedules
  SET deleted_at = now()
  WHERE id = p_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_professional_schedule(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_professional_schedule(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: professional time blocks
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_professional_time_block(
  p_branch_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_kind public.time_block_kind DEFAULT 'blocked',
  p_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_row public.professional_time_blocks%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para crear bloqueos';
  END IF;

  IF p_branch_id IS NULL OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_kind IS NULL THEN
    RAISE EXCEPTION 'branch_id, starts_at, ends_at y kind son requeridos';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at debe ser posterior a starts_at';
  END IF;

  IF NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  INSERT INTO public.professional_time_blocks (
    organization_id,
    branch_id,
    user_id,
    kind,
    starts_at,
    ends_at,
    reason,
    created_by
  ) VALUES (
    v_org_id,
    p_branch_id,
    p_user_id,
    p_kind,
    p_starts_at,
    p_ends_at,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organization_id', v_row.organization_id,
    'branch_id', v_row.branch_id,
    'user_id', v_row.user_id,
    'kind', v_row.kind,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'reason', v_row.reason,
    'created_by', v_row.created_by,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_professional_time_block(UUID, TIMESTAMPTZ, TIMESTAMPTZ, public.time_block_kind, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_professional_time_block(UUID, TIMESTAMPTZ, TIMESTAMPTZ, public.time_block_kind, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_professional_time_blocks(
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.professional_time_blocks
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.*
  FROM public.professional_time_blocks b
  WHERE b.organization_id = v_org_id
    AND b.deleted_at IS NULL
    AND public.user_has_branch_access(b.branch_id)
    AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
    AND (
      p_user_id IS NULL
      OR b.user_id IS NULL
      OR b.user_id = p_user_id
    )
    AND (p_from IS NULL OR b.ends_at > p_from)
    AND (p_to IS NULL OR b.starts_at < p_to)
  ORDER BY b.starts_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_professional_time_blocks(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_professional_time_blocks(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_professional_time_block(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_branch UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para eliminar bloqueos';
  END IF;

  SELECT branch_id INTO v_branch
  FROM public.professional_time_blocks
  WHERE id = p_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'Bloqueo no encontrado';
  END IF;

  IF NOT public.user_has_branch_access(v_branch) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  UPDATE public.professional_time_blocks
  SET deleted_at = now()
  WHERE id = p_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_professional_time_block(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_professional_time_block(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: waitlist
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_waitlist_entry(
  p_branch_id UUID,
  p_owner_id UUID,
  p_patient_id UUID,
  p_appointment_type public.appointment_type DEFAULT 'consulta',
  p_preferred_user_id UUID DEFAULT NULL,
  p_preferred_weekdays SMALLINT[] DEFAULT NULL,
  p_preferred_time_start TIME DEFAULT NULL,
  p_preferred_time_end TIME DEFAULT NULL,
  p_priority INT DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_row public.appointment_waitlist%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para crear lista de espera';
  END IF;

  IF p_branch_id IS NULL OR p_owner_id IS NULL OR p_patient_id IS NULL THEN
    RAISE EXCEPTION 'branch_id, owner_id y patient_id son requeridos';
  END IF;

  IF NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.owners o
    WHERE o.id = p_owner_id AND o.organization_id = v_org_id AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tutor no encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = p_patient_id AND p.organization_id = v_org_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Paciente no encontrado';
  END IF;

  INSERT INTO public.appointment_waitlist (
    organization_id,
    branch_id,
    owner_id,
    patient_id,
    preferred_user_id,
    appointment_type,
    preferred_weekdays,
    preferred_time_start,
    preferred_time_end,
    priority,
    notes,
    status,
    created_by
  ) VALUES (
    v_org_id,
    p_branch_id,
    p_owner_id,
    p_patient_id,
    p_preferred_user_id,
    COALESCE(p_appointment_type, 'consulta'),
    p_preferred_weekdays,
    p_preferred_time_start,
    p_preferred_time_end,
    COALESCE(p_priority, 0),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'open',
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organization_id', v_row.organization_id,
    'branch_id', v_row.branch_id,
    'owner_id', v_row.owner_id,
    'patient_id', v_row.patient_id,
    'preferred_user_id', v_row.preferred_user_id,
    'appointment_type', v_row.appointment_type,
    'preferred_weekdays', to_jsonb(v_row.preferred_weekdays),
    'preferred_time_start', v_row.preferred_time_start,
    'preferred_time_end', v_row.preferred_time_end,
    'priority', v_row.priority,
    'notes', v_row.notes,
    'status', v_row.status,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_waitlist_entry(UUID, UUID, UUID, public.appointment_type, UUID, SMALLINT[], TIME, TIME, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_waitlist_entry(UUID, UUID, UUID, public.appointment_type, UUID, SMALLINT[], TIME, TIME, INT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_waitlist(
  p_branch_id UUID DEFAULT NULL,
  p_status public.waitlist_status DEFAULT NULL
)
RETURNS SETOF public.appointment_waitlist
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT w.*
  FROM public.appointment_waitlist w
  WHERE w.organization_id = v_org_id
    AND w.deleted_at IS NULL
    AND public.user_has_branch_access(w.branch_id)
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    AND (p_status IS NULL OR w.status = p_status)
  ORDER BY w.priority DESC, w.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_waitlist(UUID, public.waitlist_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_waitlist(UUID, public.waitlist_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_waitlist_status(
  p_id UUID,
  p_status public.waitlist_status,
  p_matched_appointment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_row public.appointment_waitlist%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para actualizar lista de espera';
  END IF;

  IF p_id IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'id y status son requeridos';
  END IF;

  SELECT * INTO v_row
  FROM public.appointment_waitlist
  WHERE id = p_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada de lista de espera no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_row.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  IF p_matched_appointment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = p_matched_appointment_id
        AND a.organization_id = v_org_id
        AND a.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cita asociada no encontrada';
    END IF;
  END IF;

  UPDATE public.appointment_waitlist
  SET
    status = p_status,
    matched_appointment_id = COALESCE(p_matched_appointment_id, matched_appointment_id)
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'matched_appointment_id', v_row.matched_appointment_id,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_waitlist_status(UUID, public.waitlist_status, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_waitlist_status(UUID, public.waitlist_status, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.match_waitlist_for_slot(
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_branch_id UUID,
  p_assigned_user_id UUID DEFAULT NULL,
  p_appointment_type public.appointment_type DEFAULT NULL
)
RETURNS SETOF public.appointment_waitlist
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_local_start TIMESTAMP;
  v_weekday SMALLINT;
  v_start_time TIME;
  v_end_time TIME;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'starts_at, ends_at y branch_id son requeridos';
  END IF;

  IF NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  v_local_start := (p_starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_weekday := EXTRACT(ISODOW FROM v_local_start)::SMALLINT;
  v_start_time := v_local_start::TIME;
  v_end_time := (p_ends_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::TIME;

  RETURN QUERY
  SELECT w.*
  FROM public.appointment_waitlist w
  WHERE w.organization_id = v_org_id
    AND w.branch_id = p_branch_id
    AND w.deleted_at IS NULL
    AND w.status = 'open'
    AND (p_appointment_type IS NULL OR w.appointment_type = p_appointment_type)
    AND (
      w.preferred_user_id IS NULL
      OR p_assigned_user_id IS NULL
      OR w.preferred_user_id = p_assigned_user_id
    )
    AND (
      w.preferred_weekdays IS NULL
      OR cardinality(w.preferred_weekdays) = 0
      OR v_weekday = ANY (w.preferred_weekdays)
    )
    AND (
      w.preferred_time_start IS NULL
      OR w.preferred_time_end IS NULL
      OR (
        v_start_time >= w.preferred_time_start
        AND v_end_time <= w.preferred_time_end
      )
    )
  ORDER BY w.priority DESC, w.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.match_waitlist_for_slot(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, public.appointment_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_waitlist_for_slot(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, public.appointment_type) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: reminder jobs
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminder_jobs(p_appointment_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_appt public.appointments%ROWTYPE;
  v_count INT := 0;
  v_inserted INT;
  v_when TIMESTAMPTZ;
  v_status public.reminder_job_status;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para encolar recordatorios';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id requerido';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_appt.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la cita';
  END IF;

  IF v_appt.status IN ('cancelada', 'ausente', 'completada') THEN
    RETURN 0;
  END IF;

  IF v_appt.remind_confirmation THEN
    v_when := now();
    v_status := 'due';
    INSERT INTO public.appointment_reminder_jobs (
      organization_id, appointment_id, kind, status, scheduled_for, payload
    )
    SELECT
      v_org_id, v_appt.id, 'confirmation'::public.reminder_job_kind, v_status, v_when,
      jsonb_build_object('starts_at', v_appt.starts_at)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.appointment_reminder_jobs j
      WHERE j.appointment_id = v_appt.id
        AND j.kind = 'confirmation'
        AND j.status IN ('pending', 'due')
        AND j.deleted_at IS NULL
    );
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;
  END IF;

  IF v_appt.remind_24h THEN
    v_when := v_appt.starts_at - INTERVAL '24 hours';
    v_status := CASE WHEN v_when <= now() THEN 'due'::public.reminder_job_status ELSE 'pending'::public.reminder_job_status END;
    INSERT INTO public.appointment_reminder_jobs (
      organization_id, appointment_id, kind, status, scheduled_for, payload
    )
    SELECT
      v_org_id, v_appt.id, 'remind_24h'::public.reminder_job_kind, v_status, v_when,
      jsonb_build_object('starts_at', v_appt.starts_at)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.appointment_reminder_jobs j
      WHERE j.appointment_id = v_appt.id
        AND j.kind = 'remind_24h'
        AND j.status IN ('pending', 'due')
        AND j.deleted_at IS NULL
    );
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;
  END IF;

  IF v_appt.remind_2h THEN
    v_when := v_appt.starts_at - INTERVAL '2 hours';
    v_status := CASE WHEN v_when <= now() THEN 'due'::public.reminder_job_status ELSE 'pending'::public.reminder_job_status END;
    INSERT INTO public.appointment_reminder_jobs (
      organization_id, appointment_id, kind, status, scheduled_for, payload
    )
    SELECT
      v_org_id, v_appt.id, 'remind_2h'::public.reminder_job_kind, v_status, v_when,
      jsonb_build_object('starts_at', v_appt.starts_at)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.appointment_reminder_jobs j
      WHERE j.appointment_id = v_appt.id
        AND j.kind = 'remind_2h'
        AND j.status IN ('pending', 'due')
        AND j.deleted_at IS NULL
    );
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_appointment_reminder_jobs(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminder_jobs(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: list status events
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_appointment_status_events(p_appointment_id UUID)
RETURNS SETOF public.appointment_status_events
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_appointment_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = p_appointment_id
      AND a.organization_id = v_org_id
      AND a.deleted_at IS NULL
      AND public.user_has_branch_access(a.branch_id)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.*
  FROM public.appointment_status_events e
  WHERE e.organization_id = v_org_id
    AND e.appointment_id = p_appointment_id
  ORDER BY e.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_appointment_status_events(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_appointment_status_events(UUID) TO authenticated;
