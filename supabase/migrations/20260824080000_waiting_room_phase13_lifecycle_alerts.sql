-- Waiting Room Phase 13: lifecycle alerts beyond called (payment_pending + completed).
-- STAGING FIRST. Additive. Keeps portal/staff notifications in sync with queue status.

CREATE OR REPLACE FUNCTION public.trg_waiting_room_notify_called()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient TEXT;
  v_owner_id UUID;
  v_portal_user UUID;
  v_room TEXT;
  v_entered_called BOOLEAN;
  v_entered_payment BOOLEAN;
  v_entered_completed BOOLEAN;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_entered_called :=
    NEW.status IS NOT DISTINCT FROM 'called'
    AND OLD.status IS DISTINCT FROM 'called';
  v_entered_payment :=
    NEW.status IS NOT DISTINCT FROM 'payment_pending'
    AND OLD.status IS DISTINCT FROM 'payment_pending';
  v_entered_completed :=
    NEW.status IS NOT DISTINCT FROM 'completed'
    AND OLD.status IS DISTINCT FROM 'completed';

  IF NOT (v_entered_called OR v_entered_payment OR v_entered_completed) THEN
    RETURN NEW;
  END IF;

  SELECT p.name, a.owner_id, o.portal_user_id
  INTO v_patient, v_owner_id, v_portal_user
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  JOIN public.owners o ON o.id = a.owner_id
  WHERE a.id = NEW.appointment_id;

  v_room := NULLIF(btrim(COALESCE(NEW.room, '')), '');

  IF v_entered_called THEN
    PERFORM public.emit_notification(
      NEW.organization_id,
      NEW.branch_id,
      'cita',
      'Llamado: ' || COALESCE(v_patient, 'paciente'),
      CASE
        WHEN v_room IS NOT NULL THEN 'Paciente llamado · Consultorio ' || v_room
        ELSE 'Paciente llamado a consulta'
      END,
      '/sala-espera',
      'appointment',
      NEW.appointment_id,
      1
    );

    IF v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
      INSERT INTO public.owner_portal_alerts (
        organization_id,
        owner_id,
        portal_user_id,
        title,
        body,
        href,
        related_type,
        related_id
      ) VALUES (
        NEW.organization_id,
        v_owner_id,
        v_portal_user,
        '¡Te están llamando!',
        CASE
          WHEN v_room IS NOT NULL THEN
            COALESCE(v_patient, 'Tu mascota') || ' · Consultorio ' || v_room
          ELSE
            COALESCE(v_patient, 'Tu mascota') || ' está siendo llamado/a'
        END,
        '/portal/sala-espera',
        'waiting_room_entry',
        NEW.id
      );
    END IF;
  ELSIF v_entered_payment THEN
    PERFORM public.emit_notification(
      NEW.organization_id,
      NEW.branch_id,
      'cita',
      'Pago pendiente: ' || COALESCE(v_patient, 'paciente'),
      'Atención finalizada · pasar por recepción',
      '/sala-espera',
      'appointment',
      NEW.appointment_id,
      1
    );

    IF v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
      INSERT INTO public.owner_portal_alerts (
        organization_id,
        owner_id,
        portal_user_id,
        title,
        body,
        href,
        related_type,
        related_id
      ) VALUES (
        NEW.organization_id,
        v_owner_id,
        v_portal_user,
        'Atención lista · pago en recepción',
        COALESCE(v_patient, 'Tu mascota') || ' ya puede pasar por recepción para el pago',
        '/portal/sala-espera',
        'waiting_room_entry',
        NEW.id
      );
    END IF;
  ELSIF v_entered_completed THEN
    IF v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
      INSERT INTO public.owner_portal_alerts (
        organization_id,
        owner_id,
        portal_user_id,
        title,
        body,
        href,
        related_type,
        related_id
      ) VALUES (
        NEW.organization_id,
        v_owner_id,
        v_portal_user,
        'Visita completada',
        'Gracias · ' || COALESCE(v_patient, 'tu mascota') || ' ya salió de la cola de espera',
        '/portal/sala-espera',
        'waiting_room_entry',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_waiting_room_notify_called() IS
  'Waiting room lifecycle alerts: called (staff+portal), payment_pending (staff+portal), completed (portal).';

-- Trigger already exists on status/room; recreate to ensure binding to updated function.
DROP TRIGGER IF EXISTS trg_waiting_room_notify_called ON public.waiting_room_entries;
CREATE TRIGGER trg_waiting_room_notify_called
  AFTER UPDATE OF status, room ON public.waiting_room_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_waiting_room_notify_called();
