-- QA seed: fictitious owners, patients, professionals for BMW org (prod Preview).
-- Tag: notes / specialty contain [QA_SEED] for easy cleanup.
-- Safe to re-run: skips if [QA_SEED] owners already exist for this org.
--
-- After this script, run (once) to enable Agenda assignee dropdown:
--   supabase/ops/qa_seed_bmw_professional_users.sql
DO $$
DECLARE
  v_org_id UUID := '285acad6-daf1-4aaf-84d1-be39f9d5deca';
  v_branch_id UUID := 'fb781413-402b-4b7c-a4de-a47854ac481d';
  v_existing INT;
  o1 UUID; o2 UUID; o3 UUID; o4 UUID; o5 UUID; o6 UUID; o7 UUID; o8 UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
BEGIN
  SELECT count(*)::int INTO v_existing
  FROM public.owners
  WHERE organization_id = v_org_id
    AND deleted_at IS NULL
    AND coalesce(notes, '') LIKE '%[QA_SEED]%';

  IF v_existing > 0 THEN
    RAISE NOTICE 'QA_SEED already present (% owners). Skipping.', v_existing;
    RETURN;
  END IF;

  -- ── Propietarios ──────────────────────────────────────────
  INSERT INTO public.owners (organization_id, branch_id, full_name, email, phone, phone_whatsapp, document_type, document_number, city, notes)
  VALUES
    (v_org_id, v_branch_id, 'Ana Pérez', 'ana.perez.qa@example.com', '11-5555-0101', '1155550101', 'DNI', '30111222', 'CABA', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Bruno Gómez', 'bruno.gomez.qa@example.com', '11-5555-0102', '1155550102', 'DNI', '30222333', 'San Isidro', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Carla Ruiz', 'carla.ruiz.qa@example.com', '11-5555-0103', '1155550103', 'DNI', '30333444', 'Vicente López', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Diego Fernández', 'diego.fernandez.qa@example.com', '11-5555-0104', '1155550104', 'DNI', '30444555', 'Palermo', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Elena Soto', 'elena.soto.qa@example.com', '11-5555-0105', '1155550105', 'DNI', '30555666', 'Belgrano', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Facundo López', 'facundo.lopez.qa@example.com', '11-5555-0106', '1155550106', 'DNI', '30666777', 'Caballito', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Gisela Martín', 'gisela.martin.qa@example.com', '11-5555-0107', '1155550107', 'DNI', '30777888', 'Recoleta', '[QA_SEED] Tutor de prueba'),
    (v_org_id, v_branch_id, 'Hugo Navarro', 'hugo.navarro.qa@example.com', '11-5555-0108', '1155550108', 'DNI', '30888999', 'Flores', '[QA_SEED] Tutor de prueba');

  SELECT id INTO o1 FROM public.owners WHERE organization_id = v_org_id AND email = 'ana.perez.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o2 FROM public.owners WHERE organization_id = v_org_id AND email = 'bruno.gomez.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o3 FROM public.owners WHERE organization_id = v_org_id AND email = 'carla.ruiz.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o4 FROM public.owners WHERE organization_id = v_org_id AND email = 'diego.fernandez.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o5 FROM public.owners WHERE organization_id = v_org_id AND email = 'elena.soto.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o6 FROM public.owners WHERE organization_id = v_org_id AND email = 'facundo.lopez.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o7 FROM public.owners WHERE organization_id = v_org_id AND email = 'gisela.martin.qa@example.com' AND deleted_at IS NULL;
  SELECT id INTO o8 FROM public.owners WHERE organization_id = v_org_id AND email = 'hugo.navarro.qa@example.com' AND deleted_at IS NULL;

  -- ── Pacientes ─────────────────────────────────────────────
  INSERT INTO public.patients (
    organization_id, branch_id, owner_id, name, species, breed, sex, color, birth_date, is_neutered, notes
  ) VALUES
    (v_org_id, v_branch_id, o1, 'Toby', 'Canino', 'Labrador', 'Macho', 'Dorado', '2021-03-12', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o1, 'Mía', 'Felino', 'Siamés', 'Hembra', 'Crema', '2022-07-01', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o2, 'Rocky', 'Canino', 'Bulldog', 'Macho', 'Atigrado', '2020-11-20', false, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o3, 'Luna', 'Felino', 'Mestizo', 'Hembra', 'Negro', '2023-01-15', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o3, 'Coco', 'Ave', 'Loro', 'Desconocido', 'Verde', '2019-05-08', false, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o4, 'Nala', 'Canino', 'Golden Retriever', 'Hembra', 'Dorado', '2021-09-30', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o5, 'Simba', 'Felino', 'Persa', 'Macho', 'Blanco', '2022-02-14', false, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o5, 'Kiwi', 'Roedor', 'Hámster', 'Hembra', 'Marrón', '2024-06-01', false, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o6, 'Thor', 'Canino', 'Pastor Alemán', 'Macho', 'Negro y fuego', '2018-12-05', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o7, 'Olivia', 'Canino', 'Caniche', 'Hembra', 'Blanco', '2023-08-22', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o7, 'Garfield', 'Felino', 'Naranja', 'Macho', 'Naranja', '2020-04-18', true, '[QA_SEED] Paciente de prueba'),
    (v_org_id, v_branch_id, o8, 'Bella', 'Canino', 'Beagle', 'Hembra', 'Tricolor', '2022-10-10', false, '[QA_SEED] Paciente de prueba');

  -- ── Profesionales (ficha operativa; usuarios de app vía ops script) ──
  INSERT INTO public.professionals (
    organization_id, first_name, last_name, relationship_type, specialty, professional_license, is_active, notes
  ) VALUES
    (v_org_id, 'Martina', 'Vega', 'employee', 'Clínica general [QA_SEED]', 'MN-QA-1001', true, '[QA_SEED] Profesional de prueba'),
    (v_org_id, 'Nicolás', 'Ibarra', 'independent', 'Cirugía [QA_SEED]', 'MN-QA-1002', true, '[QA_SEED] Profesional de prueba'),
    (v_org_id, 'Paula', 'Ríos', 'employee', 'Dermatología [QA_SEED]', 'MN-QA-1003', true, '[QA_SEED] Profesional de prueba'),
    (v_org_id, 'Santiago', 'Molina', 'partner', 'Imágenes [QA_SEED]', 'MN-QA-1004', true, '[QA_SEED] Profesional de prueba'),
    (v_org_id, 'Valentina', 'Castro', 'independent', 'Exóticos [QA_SEED]', 'MN-QA-1005', true, '[QA_SEED] Profesional de prueba');

  SELECT id INTO p1 FROM public.professionals WHERE organization_id = v_org_id AND notes LIKE '%[QA_SEED]%' AND first_name = 'Martina' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO p2 FROM public.professionals WHERE organization_id = v_org_id AND notes LIKE '%[QA_SEED]%' AND first_name = 'Nicolás' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO p3 FROM public.professionals WHERE organization_id = v_org_id AND notes LIKE '%[QA_SEED]%' AND first_name = 'Paula' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO p4 FROM public.professionals WHERE organization_id = v_org_id AND notes LIKE '%[QA_SEED]%' AND first_name = 'Santiago' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO p5 FROM public.professionals WHERE organization_id = v_org_id AND notes LIKE '%[QA_SEED]%' AND first_name = 'Valentina' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO public.professional_branches (organization_id, professional_id, branch_id, is_active)
  SELECT v_org_id, x.id, v_branch_id, true
  FROM (VALUES (p1), (p2), (p3), (p4), (p5)) AS x(id)
  WHERE x.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.professional_branches pb
      WHERE pb.professional_id = x.id AND pb.branch_id = v_branch_id AND pb.deleted_at IS NULL
    );

  RAISE NOTICE 'QA_SEED created: 8 owners, 12 patients, 5 professionals';
END $$;

SELECT 'owners' AS kind, count(*)::int AS n FROM public.owners WHERE notes LIKE '%[QA_SEED]%' AND deleted_at IS NULL
UNION ALL
SELECT 'patients', count(*)::int FROM public.patients WHERE notes LIKE '%[QA_SEED]%' AND deleted_at IS NULL
UNION ALL
SELECT 'professionals', count(*)::int FROM public.professionals WHERE notes LIKE '%[QA_SEED]%' AND deleted_at IS NULL;
