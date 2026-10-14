-- Staging only: trg_payment_sync_waiting_room read invoices.appointment_id, which does not
-- exist, so every payment insert failed. Resolve the appointment through the consultation.
CREATE OR REPLACE FUNCTION public.trg_payment_sync_waiting_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt UUID;
BEGIN
  SELECT c.appointment_id INTO v_appt
  FROM public.invoices i
  JOIN public.consultations c ON c.id = i.consultation_id
  WHERE i.id = NEW.invoice_id
    AND i.deleted_at IS NULL;

  IF v_appt IS NOT NULL THEN
    UPDATE public.waiting_room_entries
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NEW.paid_at, now())
    WHERE appointment_id = v_appt
      AND deleted_at IS NULL
      AND status = 'payment_pending';
  END IF;

  RETURN NEW;
END;
$$;
