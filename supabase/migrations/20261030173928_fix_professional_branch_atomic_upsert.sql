-- Match the existing partial unique index; archived branch assignments remain archived.
CREATE OR REPLACE FUNCTION public.save_professional_with_agenda(
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
 ON CONFLICT(professional_id,branch_id) WHERE deleted_at IS NULL DO UPDATE SET is_active=true,deleted_at=NULL;
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

