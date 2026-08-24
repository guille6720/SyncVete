-- Waiting Room Phase 21: public check-in live status, in_consultation portal alert.
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- Public live status for QR check-in page
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_check_in_status(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_row public.appointment_check_in_tokens%ROWTYPE;
  v_entry public.waiting_room_entries%ROWTYPE;
  v_patient_name TEXT;
  v_species public.patient_species;
  v_ahead INTEGER := 0;
  v_minutes_per_patient INTEGER;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_required');
  END IF;

  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_row
  FROM public.appointment_check_in_tokens
  WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_row.redeemed_waiting_room_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry
    FROM public.waiting_room_entries w
    WHERE w.id = v_row.redeemed_waiting_room_entry_id;
  ELSE
    SELECT * INTO v_entry
    FROM public.waiting_room_entries w
    WHERE w.appointment_id = v_row.appointment_id
      AND w.deleted_at IS NULL
    ORDER BY w.checked_in_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_entry.id IS NULL THEN
    IF v_row.redeemed_at IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'session_ended');
    END IF;
    IF v_row.expires_at <= now() THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'expired');
    END IF;
    RETURN jsonb_build_object('valid', false, 'reason', 'not_checked_in');
  END IF;

  IF v_entry.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'session_ended');
  END IF;

  SELECT p.name, p.species
  INTO v_patient_name, v_species
  FROM public.patients p
  WHERE p.id = (
    SELECT a.patient_id
    FROM public.appointments a
    WHERE a.id = v_entry.appointment_id
  );

  IF v_entry.status = 'waiting' THEN
    SELECT COUNT(*)::INTEGER INTO v_ahead
    FROM public.waiting_room_entries w2
    WHERE w2.organization_id = v_entry.organization_id
      AND w2.branch_id = v_entry.branch_id
      AND w2.deleted_at IS NULL
      AND w2.status = 'waiting'
      AND (
        w2.priority > v_entry.priority
        OR (
          w2.priority = v_entry.priority
          AND COALESCE(w2.queue_position, 2147483647) < COALESCE(v_entry.queue_position, 2147483647)
        )
        OR (
          w2.priority = v_entry.priority
          AND COALESCE(w2.queue_position, 2147483647) = COALESCE(v_entry.queue_position, 2147483647)
          AND w2.checked_in_at < v_entry.checked_in_at
        )
      );
  END IF;

  SELECT COALESCE(
    (
      SELECT CASE
        WHEN (o.settings ? 'waitingRoomMinutesPerPatient')
          AND (o.settings->>'waitingRoomMinutesPerPatient') ~ '^[1-9][0-9]{0,2}$'
          AND (o.settings->>'waitingRoomMinutesPerPatient')::INTEGER BETWEEN 1 AND 120
        THEN (o.settings->>'waitingRoomMinutesPerPatient')::INTEGER
        ELSE NULL
      END
      FROM public.organizations o
      WHERE o.id = v_entry.organization_id
    ),
    (
      SELECT CASE
        WHEN avg_minutes IS NOT NULL AND avg_minutes > 0
        THEN LEAST(120, GREATEST(1, ROUND(avg_minutes)::INTEGER))
        ELSE NULL
      END
      FROM (
        SELECT AVG(
          EXTRACT(EPOCH FROM (w3.called_at - w3.checked_in_at)) / 60.0
        ) AS avg_minutes
        FROM public.waiting_room_entries w3
        WHERE w3.organization_id = v_entry.organization_id
          AND w3.branch_id = v_entry.branch_id
          AND w3.deleted_at IS NULL
          AND w3.called_at IS NOT NULL
          AND w3.called_at > w3.checked_in_at
          AND w3.checked_in_at >= (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires')
      ) measured
    ),
    15
  ) INTO v_minutes_per_patient;

  RETURN jsonb_build_object(
    'valid', true,
    'patient_name', v_patient_name,
    'patient_species', v_species,
    'waiting_room_status', v_entry.status::text,
    'queue_position', v_entry.queue_position,
    'room', v_entry.room,
    'ahead_count', v_ahead,
    'minutes_per_patient', v_minutes_per_patient,
    'checked_in_at', v_entry.checked_in_at,
    'terminal', v_entry.status = 'completed'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_check_in_status(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_check_in_status(TEXT) IS
  'Sanitized waiting-room status for tutors on the public QR check-in page (token-scoped).';

-- ─────────────────────────────────────────────
-- Portal alert on in_consultation (+ phase 20 settings gate)
-- ─────────────────────────────────────────────
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
  v_entered_consultation BOOLEAN;
  v_entered_payment BOOLEAN;
  v_entered_completed BOOLEAN;
  v_portal_alerts_enabled BOOLEAN := true;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_entered_called :=
    NEW.status IS NOT DISTINCT FROM 'called'
    AND OLD.status IS DISTINCT FROM 'called';
  v_entered_consultation :=
    NEW.status IS NOT DISTINCT FROM 'in_consultation'
    AND OLD.status IS DISTINCT FROM 'in_consultation';
  v_entered_payment :=
    NEW.status IS NOT DISTINCT FROM 'payment_pending'
    AND OLD.status IS DISTINCT FROM 'payment_pending';
  v_entered_completed :=
    NEW.status IS NOT DISTINCT FROM 'completed'
    AND OLD.status IS DISTINCT FROM 'completed';

  IF NOT (v_entered_called OR v_entered_consultation OR v_entered_payment OR v_entered_completed) THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(
      CASE
        WHEN o.settings ? 'waitingRoomPortalAlertsEnabled'
          THEN (o.settings->>'waitingRoomPortalAlertsEnabled')::boolean
        ELSE true
      END,
      true
    )
  INTO v_portal_alerts_enabled
  FROM public.organizations o
  WHERE o.id = NEW.organization_id;

  SELECT p.name, a.owner_id, ow.portal_user_id
  INTO v_patient, v_owner_id, v_portal_user
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  JOIN public.owners ow ON ow.id = a.owner_id
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

    IF v_portal_alerts_enabled AND v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
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
  ELSIF v_entered_consultation THEN
    IF v_portal_alerts_enabled AND v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
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
        'En consulta',
        COALESCE(v_patient, 'Tu mascota') || ' ya está en consulta'
          || CASE WHEN v_room IS NOT NULL THEN ' · ' || v_room ELSE '' END,
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

    IF v_portal_alerts_enabled AND v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
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
    IF v_portal_alerts_enabled AND v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
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
