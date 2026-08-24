-- Waiting Room Phase 16: sync active WR entry when appointment status becomes terminal.
-- STAGING FIRST. Additive. Does not extend appointment_status enum.

CREATE OR REPLACE FUNCTION public.trg_appointment_sync_waiting_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.waiting_room_entries%ROWTYPE;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('completada', 'ausente', 'cancelada') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_entry
  FROM public.waiting_room_entries
  WHERE appointment_id = NEW.id
    AND organization_id = NEW.organization_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completada' AND v_entry.status <> 'completed' THEN
    UPDATE public.waiting_room_entries
    SET
      status = 'completed',
      completed_at = COALESCE(completed_at, now())
    WHERE id = v_entry.id;
  ELSIF NEW.status IN ('ausente', 'cancelada') AND v_entry.status <> 'completed' THEN
    UPDATE public.waiting_room_entries
    SET deleted_at = now()
    WHERE id = v_entry.id;

    UPDATE public.appointment_check_in_tokens
    SET expires_at = least(expires_at, now())
    WHERE appointment_id = NEW.id
      AND redeemed_at IS NULL
      AND expires_at > now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_sync_waiting_room ON public.appointments;
CREATE TRIGGER trg_appointment_sync_waiting_room
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_appointment_sync_waiting_room();

COMMENT ON FUNCTION public.trg_appointment_sync_waiting_room() IS
  'When an appointment is marked completada/ausente/cancelada, completes or removes the active waiting-room entry.';
