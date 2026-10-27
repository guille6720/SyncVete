-- Allow sobreturno / overbook appointments to skip weekly-schedule window checks.
-- Overlaps and time-blocks still apply.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_overbook boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointments.is_overbook IS
  'When true, appointment may fall outside professional_schedules windows (sobreturno).';

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

  IF public.appointment_has_overlap(
    NEW.organization_id,
    NEW.assigned_user_id,
    NEW.starts_at,
    NEW.ends_at,
    NEW.id
  ) THEN
    RAISE EXCEPTION 'Horario no disponible: el profesional ya tiene una cita en ese rango';
  END IF;

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

  -- Sobreturno: skip weekly schedule window enforcement.
  IF COALESCE(NEW.is_overbook, false) THEN
    RETURN NEW;
  END IF;

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

  v_weekday := EXTRACT(ISODOW FROM v_local_start)::SMALLINT;
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
  BEFORE INSERT OR UPDATE OF
    assigned_user_id,
    branch_id,
    starts_at,
    ends_at,
    status,
    appointment_type,
    deleted_at,
    is_overbook
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_appointments_availability();
