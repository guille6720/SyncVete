-- Additive transition: account calendars remain readable by older deployments.
-- A professional calendar never needs an auth user or a branch_members entry.
ALTER TABLE public.professional_schedules
  ADD COLUMN professional_id uuid REFERENCES public.professionals(id) ON DELETE RESTRICT;
ALTER TABLE public.professional_schedules ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.professional_schedules ADD CONSTRAINT professional_schedule_identity
  CHECK ((professional_id IS NOT NULL AND user_id IS NULL) OR (professional_id IS NULL AND user_id IS NOT NULL));
ALTER TABLE public.professional_time_blocks
  ADD COLUMN professional_id uuid REFERENCES public.professionals(id) ON DELETE RESTRICT;
ALTER TABLE public.appointments
  ADD COLUMN assigned_professional_id uuid REFERENCES public.professionals(id) ON DELETE RESTRICT;
CREATE INDEX professional_schedule_ficha_lookup ON public.professional_schedules
  (organization_id, professional_id, branch_id, weekday) WHERE deleted_at IS NULL AND is_active;
CREATE UNIQUE INDEX professional_schedule_ficha_window ON public.professional_schedules
  (organization_id, professional_id, branch_id, weekday, start_time)
  WHERE deleted_at IS NULL AND professional_id IS NOT NULL;
CREATE INDEX appointment_professional_overlap ON public.appointments
  (organization_id, assigned_professional_id, starts_at, ends_at)
  WHERE deleted_at IS NULL AND assigned_professional_id IS NOT NULL AND status NOT IN ('cancelada','ausente');
CREATE INDEX time_block_professional_lookup ON public.professional_time_blocks
  (organization_id, professional_id, branch_id, starts_at) WHERE deleted_at IS NULL;

-- Copy current hours independently to each ficha. Keep legacy hours, appointments
-- and account links intact, including ambiguous appointments of shared accounts.
INSERT INTO public.professional_schedules
  (organization_id,branch_id,professional_id,user_id,weekday,start_time,end_time,slot_duration_minutes,allowed_appointment_types,is_active)
SELECT s.organization_id,s.branch_id,p.id,NULL,s.weekday,s.start_time,s.end_time,
       s.slot_duration_minutes,s.allowed_appointment_types,s.is_active
FROM public.professional_schedules s
JOIN public.professionals p ON p.organization_id=s.organization_id AND p.user_id=s.user_id AND p.deleted_at IS NULL
JOIN public.professional_branches pb ON pb.organization_id=p.organization_id AND pb.professional_id=p.id
  AND pb.branch_id=s.branch_id AND pb.is_active AND pb.deleted_at IS NULL
WHERE s.professional_id IS NULL AND s.deleted_at IS NULL AND s.is_active;

CREATE FUNCTION public.guard_professional_agenda_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.professionals p JOIN public.professional_branches pb
      ON pb.professional_id=p.id AND pb.organization_id=p.organization_id
    WHERE p.id=NEW.professional_id AND p.organization_id=NEW.organization_id
      AND p.deleted_at IS NULL AND pb.branch_id=NEW.branch_id AND pb.is_active AND pb.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Profesional no disponible en esta sucursal. Asignale esta sucursal desde su ficha.'; END IF;
  IF TG_TABLE_NAME='professional_schedules' AND NEW.professional_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('professional:'||NEW.professional_id::text,0));
    IF NEW.deleted_at IS NULL AND NEW.is_active AND EXISTS(SELECT 1 FROM public.professional_schedules s
      WHERE s.organization_id=NEW.organization_id AND s.professional_id=NEW.professional_id AND s.branch_id=NEW.branch_id
      AND s.id<>NEW.id AND s.deleted_at IS NULL AND s.is_active AND s.weekday=NEW.weekday
      AND s.start_time<NEW.end_time AND s.end_time>NEW.start_time) THEN
      RAISE EXCEPTION 'Los horarios se superponen. Corregí las franjas del mismo día.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_professional_agenda_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_professional_schedule_identity BEFORE INSERT OR UPDATE OF organization_id,professional_id,branch_id
 ON public.professional_schedules FOR EACH ROW EXECUTE FUNCTION public.guard_professional_agenda_identity();
CREATE TRIGGER guard_professional_block_identity BEFORE INSERT OR UPDATE OF organization_id,professional_id,branch_id
 ON public.professional_time_blocks FOR EACH ROW EXECUTE FUNCTION public.guard_professional_agenda_identity();

-- The ficha, branch memberships and complete week commit or roll back together.
CREATE FUNCTION public.save_professional_with_agenda(
 p_id uuid,p_data jsonb,p_branch_ids uuid[],p_schedules jsonb DEFAULT NULL,p_create boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_org uuid:=public.get_user_organization_id(); v_row public.professionals%ROWTYPE;
 v_branches uuid[]; v_old_branches uuid[]; v_branch uuid; v_window jsonb; v_saved integer;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.has_permission('professionals:write') THEN
   RAISE EXCEPTION 'No tenés permiso para guardar profesionales. Pedile a un administrador que habilite professionals:write.';
 END IF;
 IF p_id IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Datos inválidos. Revisá nombre y apellido.'; END IF;
 IF p_schedules IS NOT NULL AND NOT public.has_permission('appointments:write') THEN
   RAISE EXCEPTION 'No tenés permiso para modificar horarios. Pedile a un administrador que habilite appointments:write.';
 END IF;
 IF p_branch_ids IS NULL OR cardinality(p_branch_ids)=0 OR cardinality(p_branch_ids)>100 OR array_position(p_branch_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'Seleccioná al menos una sucursal para guardar el profesional.';
 END IF;
 SELECT array_agg(DISTINCT b ORDER BY b) INTO v_branches FROM unnest(p_branch_ids) b;
 FOREACH v_branch IN ARRAY v_branches LOOP
   IF NOT public.user_has_branch_access(v_branch) OR NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=v_branch AND b.organization_id=v_org AND b.is_active AND b.deleted_at IS NULL) THEN
     RAISE EXCEPTION 'No tenés acceso a una sucursal seleccionada. Elegí una sucursal habilitada.';
   END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('professional:'||p_id::text,0));
 SELECT * INTO v_row FROM public.professionals WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
   IF v_row.organization_id<>v_org OR v_row.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Profesional no disponible. Volvé a la lista de tu clínica.'; END IF;
   SELECT array_agg(pb.branch_id) INTO v_old_branches FROM public.professional_branches pb WHERE pb.professional_id=p_id AND pb.is_active AND pb.deleted_at IS NULL;
   IF EXISTS(SELECT 1 FROM unnest(v_old_branches) b WHERE NOT public.user_has_branch_access(b)) THEN
     RAISE EXCEPTION 'No tenés acceso a todas las sucursales de este profesional. Pedile a un administrador que lo edite.';
   END IF;
 ELSIF NOT p_create THEN RAISE EXCEPTION 'Profesional no encontrado. Volvé a la lista y abrí su ficha.';
 ELSE
   INSERT INTO public.professionals(id,organization_id,first_name,last_name,relationship_type,is_active)
   VALUES(p_id,v_org,p_data->>'first_name',p_data->>'last_name',COALESCE((p_data->>'relationship_type')::public.professional_relationship_type,'independent'),true)
   RETURNING * INTO v_row;
 END IF;
 -- Only editable ficha fields; never accept auth identity or organization changes.
 v_row:=jsonb_populate_record(v_row, p_data - ARRAY['id','organization_id','user_id','profile_id','created_at','created_by','updated_at','deleted_at']);
 IF NULLIF(btrim(v_row.first_name),'') IS NULL OR NULLIF(btrim(v_row.last_name),'') IS NULL THEN RAISE EXCEPTION 'Completá nombre y apellido para guardar.'; END IF;
 UPDATE public.professionals SET first_name=btrim(v_row.first_name),last_name=btrim(v_row.last_name),
   specialty=v_row.specialty,relationship_type=v_row.relationship_type,document_number=v_row.document_number,
   tax_id=v_row.tax_id,professional_license=v_row.professional_license,professional_license_jurisdiction=v_row.professional_license_jurisdiction,
   start_date=v_row.start_date,end_date=v_row.end_date,is_active=v_row.is_active,invoice_required=v_row.invoice_required,notes=v_row.notes
 WHERE id=p_id AND organization_id=v_org RETURNING * INTO v_row;
 UPDATE public.professional_branches SET is_active=false WHERE professional_id=p_id AND organization_id=v_org AND NOT(branch_id=ANY(v_branches));
 INSERT INTO public.professional_branches(organization_id,professional_id,branch_id,is_active)
 SELECT v_org,p_id,b,true FROM unnest(v_branches) b
 ON CONFLICT(professional_id,branch_id) DO UPDATE SET is_active=true,deleted_at=NULL;
 -- Archive hours in removed branches too. No stale calendar survives removal.
 UPDATE public.professional_schedules SET deleted_at=now(),is_active=false
 WHERE organization_id=v_org AND professional_id=p_id AND deleted_at IS NULL
   AND (p_schedules IS NOT NULL OR NOT(branch_id=ANY(v_branches)));
 IF p_schedules IS NOT NULL THEN
   IF jsonb_typeof(p_schedules)<>'array' OR jsonb_array_length(p_schedules)>100 THEN RAISE EXCEPTION 'Horarios inválidos. Volvé a seleccionar días y horas.'; END IF;
   FOR v_window IN SELECT value FROM jsonb_array_elements(p_schedules) LOOP
     IF jsonb_typeof(v_window)<>'object' OR (v_window->>'weekday')::int NOT BETWEEN 1 AND 7
       OR (v_window->>'start_time')::time >= (v_window->>'end_time')::time
       OR (v_window->>'slot_duration_minutes')::int NOT BETWEEN 5 AND 480
       OR v_window->>'weekday' IS NULL OR v_window->>'start_time' IS NULL OR v_window->>'end_time' IS NULL OR v_window->>'slot_duration_minutes' IS NULL THEN
       RAISE EXCEPTION 'Horario inválido. La hora final debe ser posterior al inicio y el turno debe durar entre 5 y 480 minutos.';
     END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_schedules) WITH ORDINALITY a(w,n)
     JOIN jsonb_array_elements(p_schedules) WITH ORDINALITY b(w,n) ON a.n<b.n
     WHERE a.w->>'weekday'=b.w->>'weekday' AND (a.w->>'start_time')::time < (b.w->>'end_time')::time AND (a.w->>'end_time')::time > (b.w->>'start_time')::time) THEN
     RAISE EXCEPTION 'Los horarios se superponen. Corregí las franjas del mismo día.';
   END IF;
   INSERT INTO public.professional_schedules(organization_id,branch_id,professional_id,user_id,weekday,start_time,end_time,slot_duration_minutes)
   SELECT v_org,b,p_id,NULL,(w->>'weekday')::smallint,(w->>'start_time')::time,(w->>'end_time')::time,(w->>'slot_duration_minutes')::int
   FROM unnest(v_branches) b CROSS JOIN jsonb_array_elements(p_schedules) w;
   GET DIAGNOSTICS v_saved=ROW_COUNT;
   IF v_saved<>cardinality(v_branches)*jsonb_array_length(p_schedules) THEN RAISE EXCEPTION 'No se guardaron todos los horarios. Reintentá; no se aplicó ningún cambio.'; END IF;
 END IF;
 RETURN to_jsonb(v_row);
END; $$;
REVOKE ALL ON FUNCTION public.save_professional_with_agenda(uuid,jsonb,uuid[],jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_professional_with_agenda(uuid,jsonb,uuid[],jsonb,boolean) TO authenticated;

CREATE FUNCTION public.list_agenda_professionals() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('professionalId',p.id,'userId',COALESCE(p.user_id::text,''),'fullName',concat_ws(' ',p.first_name,p.last_name),'specialty',p.specialty,'role','veterinarian','branchIds',jsonb_agg(pb.branch_id ORDER BY pb.branch_id))
 FROM public.professionals p JOIN public.professional_branches pb ON pb.professional_id=p.id AND pb.organization_id=p.organization_id
 JOIN public.branches b ON b.id=pb.branch_id AND b.organization_id=p.organization_id AND b.is_active AND b.deleted_at IS NULL
 WHERE auth.uid() IS NOT NULL AND p.organization_id=public.get_user_organization_id() AND public.has_permission('appointments:read')
   AND p.is_active AND p.deleted_at IS NULL AND pb.is_active AND pb.deleted_at IS NULL AND public.user_has_branch_access(pb.branch_id)
 GROUP BY p.id
 UNION ALL
 SELECT jsonb_build_object('professionalId',NULL,'userId',pr.id,'fullName',
   CASE WHEN EXISTS(SELECT 1 FROM public.professionals p WHERE p.user_id=pr.id AND p.organization_id=pr.organization_id AND p.deleted_at IS NULL)
   THEN 'Agenda anterior · '||pr.full_name ELSE pr.full_name END,
   'specialty',NULL,'role',min(bm.role::text),'branchIds',jsonb_agg(DISTINCT bm.branch_id))
 FROM public.profiles pr JOIN public.branch_members bm ON bm.user_id=pr.id AND bm.organization_id=pr.organization_id
 WHERE auth.uid() IS NOT NULL AND pr.organization_id=public.get_user_organization_id() AND public.has_permission('appointments:read')
   AND pr.is_active AND pr.deleted_at IS NULL AND bm.is_active AND bm.deleted_at IS NULL AND bm.role::text IN ('owner','admin','veterinarian')
   AND public.user_has_branch_access(bm.branch_id)
   AND (NOT EXISTS(SELECT 1 FROM public.professionals p WHERE p.user_id=pr.id AND p.organization_id=pr.organization_id AND p.is_active AND p.deleted_at IS NULL)
     OR EXISTS(SELECT 1 FROM public.appointments a WHERE a.organization_id=pr.organization_id AND a.assigned_user_id=pr.id AND a.assigned_professional_id IS NULL AND a.deleted_at IS NULL AND public.user_has_branch_access(a.branch_id)))
 GROUP BY pr.id;
$$;
REVOKE ALL ON FUNCTION public.list_agenda_professionals() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_agenda_professionals() TO authenticated;

CREATE FUNCTION public.list_agenda_schedules(p_assignee_id uuid DEFAULT NULL,p_branch_id uuid DEFAULT NULL)
RETURNS SETOF public.professional_schedules LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.* FROM public.professional_schedules s
 WHERE auth.uid() IS NOT NULL AND s.organization_id=public.get_user_organization_id() AND public.has_permission('appointments:read')
 AND s.deleted_at IS NULL AND s.is_active AND public.user_has_branch_access(s.branch_id)
 AND (p_branch_id IS NULL OR s.branch_id=p_branch_id)
 AND (p_assignee_id IS NULL OR s.professional_id=p_assignee_id OR (s.professional_id IS NULL AND s.user_id=p_assignee_id));
$$;
REVOKE ALL ON FUNCTION public.list_agenda_schedules(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_agenda_schedules(uuid,uuid) TO authenticated;

CREATE FUNCTION public.list_agenda_appointments(p_from date,p_to date,p_branch_id uuid DEFAULT NULL,p_status text DEFAULT NULL,p_assignee_id uuid DEFAULT NULL,p_query text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_permission('appointments:read') THEN RETURN; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Elegí un rango válido de hasta un año.'; END IF;
 RETURN QUERY SELECT to_jsonb(a)||jsonb_build_object('patient_name',p.name,'patient_species',p.species,'owner_full_name',o.full_name,
 'assigned_user_name',CASE WHEN pro.id IS NOT NULL THEN concat_ws(' ',pro.first_name,pro.last_name) ELSE pr.full_name END)
 FROM public.appointments a JOIN public.patients p ON p.id=a.patient_id AND p.organization_id=a.organization_id AND p.deleted_at IS NULL
 JOIN public.owners o ON o.id=a.owner_id AND o.organization_id=a.organization_id AND o.deleted_at IS NULL
 LEFT JOIN public.professionals pro ON pro.id=a.assigned_professional_id AND pro.organization_id=a.organization_id
 LEFT JOIN public.profiles pr ON pr.id=a.assigned_user_id AND pr.organization_id=a.organization_id
 WHERE a.organization_id=public.get_user_organization_id() AND a.deleted_at IS NULL AND public.user_has_branch_access(a.branch_id)
 AND a.starts_at >= (p_from::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 AND a.starts_at < ((p_to+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 AND (p_branch_id IS NULL OR a.branch_id=p_branch_id) AND (NULLIF(p_status,'') IS NULL OR a.status::text=p_status)
 AND (p_assignee_id IS NULL OR a.assigned_professional_id=p_assignee_id OR (a.assigned_professional_id IS NULL AND a.assigned_user_id=p_assignee_id))
 AND (NULLIF(btrim(p_query),'') IS NULL OR concat_ws(' ',p.name,o.full_name,pro.first_name,pro.last_name,pr.full_name,a.title,a.room) ILIKE '%'||btrim(p_query)||'%')
 ORDER BY a.starts_at;
END; $$;
REVOKE ALL ON FUNCTION public.list_agenda_appointments(date,date,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_agenda_appointments(date,date,uuid,text,uuid,text) TO authenticated;

-- Read-only busy ranges, with no patient data, for the booking time buttons.
CREATE FUNCTION public.agenda_busy_ranges(p_assignee_id uuid,p_branch_id uuid,p_date date)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',a.id,'startsAt',a.starts_at,'endsAt',a.ends_at,'kind','appointment')
 FROM public.appointments a LEFT JOIN public.professionals pro ON pro.id=p_assignee_id AND pro.organization_id=a.organization_id
 WHERE auth.uid() IS NOT NULL AND public.has_permission('appointments:read') AND a.organization_id=public.get_user_organization_id()
 AND public.user_has_branch_access(p_branch_id) AND public.user_has_branch_access(a.branch_id)
 AND a.deleted_at IS NULL AND a.status NOT IN ('cancelada','ausente')
 AND (a.assigned_professional_id=p_assignee_id OR (a.assigned_professional_id IS NULL AND a.assigned_user_id=COALESCE(pro.user_id,p_assignee_id)))
 AND a.starts_at < ((p_date+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 AND a.ends_at > (p_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 UNION ALL
 SELECT jsonb_build_object('id',b.id,'startsAt',b.starts_at,'endsAt',b.ends_at,'kind','block')
 FROM public.professional_time_blocks b LEFT JOIN public.professionals pro ON pro.id=p_assignee_id AND pro.organization_id=b.organization_id
 WHERE auth.uid() IS NOT NULL AND public.has_permission('appointments:read') AND b.organization_id=public.get_user_organization_id()
 AND public.user_has_branch_access(p_branch_id) AND b.branch_id=p_branch_id AND b.deleted_at IS NULL
 AND (b.professional_id=p_assignee_id OR (b.professional_id IS NULL AND (b.user_id IS NULL OR b.user_id=COALESCE(pro.user_id,p_assignee_id))))
 AND b.starts_at < ((p_date+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 AND b.ends_at > (p_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
$$;
REVOKE ALL ON FUNCTION public.agenda_busy_ranges(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agenda_busy_ranges(uuid,uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_appointments_availability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pro public.professionals%ROWTYPE; v_user uuid; v_start timestamp; v_end timestamp; v_has boolean;
BEGIN
 IF NEW.deleted_at IS NOT NULL OR NEW.status IN ('cancelada','ausente') THEN RETURN NEW; END IF;
 -- Scope is checked in the database too, including direct Data API writes.
 IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id AND b.organization_id=NEW.organization_id AND b.deleted_at IS NULL AND b.is_active)
 OR NOT EXISTS(SELECT 1 FROM public.patients p WHERE p.id=NEW.patient_id AND p.organization_id=NEW.organization_id AND p.owner_id=NEW.owner_id AND p.deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.owners o WHERE o.id=NEW.owner_id AND o.organization_id=NEW.organization_id AND o.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Paciente, tutor o sucursal no disponibles en esta clínica. Volvé a seleccionarlos.';
 END IF;
 -- Owner-portal RPCs have their own patient/owner checks and intentionally do
 -- not grant staff branch memberships. Direct writes still require staff RLS.
 IF auth.uid() IS NOT NULL AND public.has_permission('appointments:write') AND NOT public.user_has_branch_access(NEW.branch_id) THEN
   RAISE EXCEPTION 'No tenés acceso a esta sucursal. Seleccioná una sucursal habilitada.';
 END IF;
 -- Completing a saved appointment must remain possible after hours change.
 IF TG_OP='UPDATE' AND OLD.status NOT IN ('cancelada','ausente')
 AND (OLD.assigned_professional_id,OLD.assigned_user_id,OLD.branch_id,OLD.starts_at,OLD.ends_at,OLD.appointment_type)
 IS NOT DISTINCT FROM (NEW.assigned_professional_id,NEW.assigned_user_id,NEW.branch_id,NEW.starts_at,NEW.ends_at,NEW.appointment_type) THEN RETURN NEW; END IF;
 IF NEW.ends_at<=NEW.starts_at THEN RAISE EXCEPTION 'Horario inválido. La hora final debe ser posterior al inicio.'; END IF;
 IF NEW.assigned_professional_id IS NOT NULL THEN
   SELECT * INTO v_pro FROM public.professionals p WHERE p.id=NEW.assigned_professional_id AND p.organization_id=NEW.organization_id AND p.is_active AND p.deleted_at IS NULL;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.professional_branches pb WHERE pb.professional_id=v_pro.id AND pb.organization_id=NEW.organization_id AND pb.branch_id=NEW.branch_id AND pb.is_active AND pb.deleted_at IS NULL) THEN
     RAISE EXCEPTION 'Profesional no disponible en esta sucursal. Revisá su ficha y la sucursal asignada.';
   END IF;
   -- A booking uses the professional identity, never a fabricated login account.
   NEW.assigned_user_id:=NULL;
   v_user:=v_pro.user_id;
   IF v_user IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0)); END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('professional:'||v_pro.id::text,0));
   IF NOT EXISTS(SELECT 1 FROM public.professionals p JOIN public.professional_branches pb ON pb.professional_id=p.id AND pb.organization_id=p.organization_id
     WHERE p.id=v_pro.id AND p.organization_id=NEW.organization_id AND p.is_active AND p.deleted_at IS NULL AND pb.branch_id=NEW.branch_id AND pb.is_active AND pb.deleted_at IS NULL) THEN
     RAISE EXCEPTION 'La agenda cambió mientras elegías el turno. Revisá la ficha y seleccioná otro horario.';
   END IF;
 ELSE
   v_user:=NEW.assigned_user_id;
   IF v_user IS NULL THEN RETURN NEW; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.branch_members bm JOIN public.profiles pr ON pr.id=bm.user_id AND pr.organization_id=bm.organization_id
     WHERE bm.user_id=v_user AND bm.organization_id=NEW.organization_id AND bm.branch_id=NEW.branch_id AND bm.is_active AND bm.deleted_at IS NULL AND pr.is_active AND pr.deleted_at IS NULL) THEN
     RAISE EXCEPTION 'Profesional no disponible en esta sucursal. Seleccioná un profesional activo.';
   END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 END IF;
 IF EXISTS(SELECT 1 FROM public.appointments a LEFT JOIN public.professionals p ON p.id=a.assigned_professional_id AND p.organization_id=a.organization_id
   WHERE a.organization_id=NEW.organization_id AND a.id<>NEW.id AND a.deleted_at IS NULL AND a.status NOT IN ('cancelada','ausente')
   AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at
   AND ((NEW.assigned_professional_id IS NOT NULL AND (a.assigned_professional_id=NEW.assigned_professional_id OR (a.assigned_professional_id IS NULL AND a.assigned_user_id=v_user)))
     OR (NEW.assigned_professional_id IS NULL AND (a.assigned_user_id=v_user OR p.user_id=v_user)))) THEN
   RAISE EXCEPTION 'El turno acaba de ocuparse. Elegí otro horario; tus datos siguen cargados.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.professional_time_blocks b WHERE b.organization_id=NEW.organization_id AND b.branch_id=NEW.branch_id AND b.deleted_at IS NULL
   AND b.starts_at<NEW.ends_at AND b.ends_at>NEW.starts_at
   AND (b.professional_id=NEW.assigned_professional_id OR (b.professional_id IS NULL AND (b.user_id IS NULL OR b.user_id=v_user)))) THEN
   RAISE EXCEPTION 'Este horario tiene un bloqueo de agenda. Elegí otro horario o revisá Disponibilidad.';
 END IF;
 IF COALESCE(NEW.is_overbook,false) THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM public.professional_schedules s WHERE s.organization_id=NEW.organization_id AND s.branch_id=NEW.branch_id AND s.deleted_at IS NULL AND s.is_active
   AND (s.professional_id=NEW.assigned_professional_id OR (NEW.assigned_professional_id IS NULL AND s.professional_id IS NULL AND s.user_id=v_user))) INTO v_has;
 IF NOT v_has THEN
   IF NEW.assigned_professional_id IS NOT NULL THEN RAISE EXCEPTION 'El profesional no tiene horarios cargados. Abrí su ficha y agregá días y horarios antes de asignar un turno.'; END IF;
   RETURN NEW;
 END IF;
 v_start:=NEW.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires';
 v_end:=NEW.ends_at AT TIME ZONE 'America/Argentina/Buenos_Aires';
 IF v_start::date<>v_end::date OR NOT EXISTS(SELECT 1 FROM public.professional_schedules s
   WHERE s.organization_id=NEW.organization_id AND s.branch_id=NEW.branch_id AND s.deleted_at IS NULL AND s.is_active
   AND (s.professional_id=NEW.assigned_professional_id OR (NEW.assigned_professional_id IS NULL AND s.professional_id IS NULL AND s.user_id=v_user))
   AND s.weekday=extract(isodow FROM v_start) AND s.start_time<=v_start::time AND s.end_time>=v_end::time
   AND (s.allowed_appointment_types IS NULL OR NEW.appointment_type=ANY(s.allowed_appointment_types))) THEN
   RAISE EXCEPTION 'Horario fuera de la agenda del profesional. Elegí uno de los horarios disponibles.';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.trg_fn_appointments_availability() FROM PUBLIC,anon,authenticated;
DROP TRIGGER trg_appointments_availability ON public.appointments;
CREATE TRIGGER trg_appointments_availability BEFORE INSERT OR UPDATE OF assigned_professional_id,assigned_user_id,branch_id,patient_id,owner_id,starts_at,ends_at,status,appointment_type,deleted_at,is_overbook
 ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.trg_fn_appointments_availability();
