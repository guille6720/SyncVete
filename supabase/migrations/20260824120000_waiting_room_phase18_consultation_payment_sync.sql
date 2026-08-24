-- Waiting Room Phase 18: fix appointment completada → WR sync for payment flow.
-- When a consultation completes, appointment becomes completada but WR should move to
-- payment_pending (not skip straight to completed).
-- STAGING FIRST. Replaces trg_appointment_sync_waiting_room from phase 16.

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
    IF v_entry.status = 'in_consultation' THEN
      UPDATE public.waiting_room_entries
      SET
        status = 'payment_pending',
        payment_pending_at = COALESCE(payment_pending_at, now())
      WHERE id = v_entry.id;
    ELSIF v_entry.status = 'payment_pending' THEN
      NULL;
    ELSE
      UPDATE public.waiting_room_entries
      SET
        status = 'completed',
        completed_at = COALESCE(completed_at, now())
      WHERE id = v_entry.id;
    END IF;
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

COMMENT ON FUNCTION public.trg_appointment_sync_waiting_room() IS
  'Syncs WR when appointment is terminal: completada moves in_consultation → payment_pending; payment_pending unchanged; ausente/cancelada removes entry.';
