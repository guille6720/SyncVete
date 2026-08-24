-- Waiting Room Phase 20: portal realtime alerts, owner WR history, portal alert toggle.
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- Realtime: owner_portal_alerts (portal tutors)
-- ─────────────────────────────────────────────
ALTER TABLE public.owner_portal_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'owner_portal_alerts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_portal_alerts;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Owner WR history (mirror phase 19 patient RPC)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_owner_waiting_room_history(
  p_owner_id UUID,
  p_limit INT DEFAULT 8
)
RETURNS TABLE (
  waiting_room_entry_id UUID,
  appointment_id UUID,
  patient_id UUID,
  patient_name TEXT,
  checked_in_at TIMESTAMPTZ,
  waiting_room_status TEXT,
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  removed BOOLEAN,
  room TEXT,
  appointment_starts_at TIMESTAMPTZ,
  minutes_to_call NUMERIC,
  minutes_dwell NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_limit INT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
     OR NOT public.has_permission('patients:read')
     OR NOT public.has_permission('waiting_room:read') THEN
    RETURN;
  END IF;

  IF p_owner_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.owners o
    WHERE o.id = p_owner_id
      AND o.organization_id = v_org_id
      AND o.deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);

  RETURN QUERY
  SELECT
    w.id AS waiting_room_entry_id,
    w.appointment_id,
    a.patient_id,
    p.name AS patient_name,
    w.checked_in_at,
    w.status::text AS waiting_room_status,
    w.called_at,
    w.completed_at,
    (w.deleted_at IS NOT NULL) AS removed,
    w.room,
    a.starts_at AS appointment_starts_at,
    CASE
      WHEN w.called_at IS NOT NULL AND w.called_at > w.checked_in_at THEN
        ROUND(EXTRACT(EPOCH FROM (w.called_at - w.checked_in_at)) / 60.0)
      ELSE NULL
    END AS minutes_to_call,
    CASE
      WHEN COALESCE(w.completed_at, w.deleted_at) IS NOT NULL
        AND COALESCE(w.completed_at, w.deleted_at) > w.checked_in_at THEN
        ROUND(
          EXTRACT(EPOCH FROM (COALESCE(w.completed_at, w.deleted_at) - w.checked_in_at)) / 60.0
        )
      ELSE NULL
    END AS minutes_dwell
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
  INNER JOIN public.patients p
    ON p.id = a.patient_id
   AND p.deleted_at IS NULL
  WHERE w.organization_id = v_org_id
    AND a.owner_id = p_owner_id
    AND public.user_has_branch_access(w.branch_id)
  ORDER BY w.checked_in_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_owner_waiting_room_history(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.list_owner_waiting_room_history(UUID, INT) IS
  'Recent waiting-room check-ins for an owner ficha (requires patients:read + waiting_room:read).';

-- ─────────────────────────────────────────────
-- Portal alerts respect clinic setting
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
  v_entered_payment :=
    NEW.status IS NOT DISTINCT FROM 'payment_pending'
    AND OLD.status IS DISTINCT FROM 'payment_pending';
  v_entered_completed :=
    NEW.status IS NOT DISTINCT FROM 'completed'
    AND OLD.status IS DISTINCT FROM 'completed';

  IF NOT (v_entered_called OR v_entered_payment OR v_entered_completed) THEN
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
