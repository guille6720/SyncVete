-- Central Admin / managed users — database security tests.
--
-- Run against STAGING only:
--   npx supabase db query --linked --project-ref <staging-ref> -f supabase/tests/central_admin_security.test.sql
--
-- Creates two throwaway clinics, impersonates users through request.jwt.claims + SET ROLE authenticated,
-- and ends with RAISE EXCEPTION so the whole transaction is always rolled back. The exception message is
-- the report: every line is "PASS|FAIL <test> :: <detail>". The last line is the totals.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.run_as(p_uid UUID, p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_out TEXT;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::TEXT, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v_out;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'OK:' || COALESCE(v_out, '');
  EXCEPTION WHEN OTHERS THEN
    RETURN 'ERR:' || SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.mk_user(p_email TEXT, p_org UUID, p_branch UUID, p_role public.user_role)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, '', now(),
    '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false
  );
  IF p_org IS NOT NULL THEN
    INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id)
    VALUES (v_id, p_org, split_part(p_email, '@', 1), p_branch);
    INSERT INTO public.branch_members (organization_id, branch_id, user_id, role)
    VALUES (p_org, p_branch, v_id, p_role);
  END IF;
  RETURN v_id;
END;
$$;

CREATE TEMP TABLE _results (seq SERIAL, name TEXT, ok BOOLEAN, detail TEXT);

CREATE OR REPLACE FUNCTION pg_temp.check(p_name TEXT, p_result TEXT, p_pattern TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO _results (name, ok, detail) VALUES (p_name, p_result ~ p_pattern, left(p_result, 160));
$$;

DO $$
DECLARE
  sfx TEXT := substr(md5(random()::TEXT), 1, 8);
  org_a UUID; org_b UUID;
  br_a1 UUID; br_a2 UUID; br_b1 UUID;
  a_owner UUID; a_admin UUID; a_vet UUID; a_recep UUID;
  b_owner UUID; b_vet UUID;
  invitee UUID;
  owner_row UUID; patient_row UUID;
  inv_id UUID;
  r TEXT;
  i INT;
  v_report TEXT;
  v_pass INT;
  v_fail INT;
BEGIN
  -- Fixtures ---------------------------------------------------------------
  INSERT INTO public.organizations (name, slug) VALUES ('CA Test A', 'ca-test-a-' || sfx) RETURNING id INTO org_a;
  INSERT INTO public.organizations (name, slug) VALUES ('CA Test B', 'ca-test-b-' || sfx) RETURNING id INTO org_b;
  INSERT INTO public.branches (organization_id, name, code, is_main) VALUES (org_a, 'A Central', 'A1', true) RETURNING id INTO br_a1;
  INSERT INTO public.branches (organization_id, name, code) VALUES (org_a, 'A Norte', 'A2') RETURNING id INTO br_a2;
  INSERT INTO public.branches (organization_id, name, code, is_main) VALUES (org_b, 'B Central', 'B1', true) RETURNING id INTO br_b1;

  a_owner := pg_temp.mk_user('owner.a.' || sfx || '@ca-test.invalid', org_a, br_a1, 'owner');
  a_admin := pg_temp.mk_user('admin.a.' || sfx || '@ca-test.invalid', org_a, br_a1, 'admin');
  a_vet   := pg_temp.mk_user('vet.a.'   || sfx || '@ca-test.invalid', org_a, br_a1, 'veterinarian');
  a_recep := pg_temp.mk_user('recep.a.' || sfx || '@ca-test.invalid', org_a, br_a2, 'receptionist');
  b_owner := pg_temp.mk_user('owner.b.' || sfx || '@ca-test.invalid', org_b, br_b1, 'owner');
  b_vet   := pg_temp.mk_user('vet.b.'   || sfx || '@ca-test.invalid', org_b, br_b1, 'veterinarian');

  INSERT INTO public.owners (organization_id, full_name) VALUES (org_a, 'Dueño Test') RETURNING id INTO owner_row;
  INSERT INTO public.patients (organization_id, owner_id, name) VALUES (org_a, owner_row, 'Firulais Test') RETURNING id INTO patient_row;
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type) VALUES (org_b, b_vet, 'create', 'patients');

  -- Cross-tenant isolation -------------------------------------------------
  r := pg_temp.run_as(a_admin, format(
    'SELECT count(*)::text FROM public.list_managed_users() WHERE user_id IN (%L, %L)', b_owner, b_vet));
  PERFORM pg_temp.check('A admin cannot list Clinic B users', r, '^OK:0$');

  r := pg_temp.run_as(a_admin, format('SELECT count(*)::text FROM public.profiles WHERE id = %L', b_vet));
  PERFORM pg_temp.check('A admin cannot read Clinic B profiles (RLS)', r, '^OK:0$');

  r := pg_temp.run_as(a_admin, format('SELECT public.set_managed_user_status(%L, ''suspended'', null)::text', b_vet));
  PERFORM pg_temp.check('A admin cannot suspend Clinic B user', r, 'USER_NOT_FOUND');

  r := pg_temp.run_as(a_admin, format('SELECT public.set_user_permission_restrictions(%L, ARRAY[''patients:write''])::text', b_vet));
  PERFORM pg_temp.check('A admin cannot change Clinic B permissions', r, 'USER_NOT_FOUND');

  r := pg_temp.run_as(a_admin, format(
    'WITH u AS (UPDATE public.branch_members SET role = ''readonly'' WHERE user_id = %L RETURNING 1) SELECT count(*)::text FROM u', b_vet));
  PERFORM pg_temp.check('A admin cannot update Clinic B membership (RLS)', r, '^OK:0$');

  r := pg_temp.run_as(a_admin, format(
    'SELECT public.create_managed_invitation(''x.%s@ca-test.invalid'', ''X'', null, %L, ''receptionist'', ''{}'')::text', sfx, br_b1));
  PERFORM pg_temp.check('A admin cannot invite into Clinic B branch', r, 'INVALID_BRANCH');

  r := pg_temp.run_as(a_admin, format('SELECT public.get_managed_user_access(%L)::text', b_vet));
  PERFORM pg_temp.check('A admin cannot read Clinic B sessions', r, 'USER_NOT_FOUND');

  r := pg_temp.run_as(a_owner, format(
    'SELECT count(*)::text FROM public.search_user_activity(%L, null, null, null, null, null, 1, 100)', b_vet));
  PERFORM pg_temp.check('A owner cannot read Clinic B activity', r, '^OK:0$');

  r := pg_temp.run_as(a_owner, 'SELECT count(*)::text FROM public.audit_logs WHERE organization_id <> public.get_user_organization_id()');
  PERFORM pg_temp.check('A owner sees no foreign audit rows (RLS)', r, '^OK:0$');

  -- Access to the Users & Permissions area --------------------------------
  r := pg_temp.run_as(a_vet, 'SELECT count(*)::text FROM public.list_managed_users()');
  PERFORM pg_temp.check('Veterinarian cannot list users', r, 'PERMISSION_DENIED');

  r := pg_temp.run_as(a_vet, 'SELECT public.get_managed_users_overview()::text');
  PERFORM pg_temp.check('Veterinarian cannot read users overview', r, 'PERMISSION_DENIED');

  r := pg_temp.run_as(a_vet, format('SELECT public.set_managed_user_status(%L, ''suspended'', null)::text', a_recep));
  PERFORM pg_temp.check('Veterinarian cannot suspend users', r, 'PERMISSION_DENIED');

  -- Self-escalation --------------------------------------------------------
  r := pg_temp.run_as(a_vet, format(
    'WITH u AS (UPDATE public.branch_members SET role = ''owner'' WHERE user_id = %L RETURNING 1) SELECT count(*)::text FROM u', a_vet));
  PERFORM pg_temp.check('Veterinarian cannot promote self (RLS)', r, '^OK:0$');

  r := pg_temp.run_as(a_admin, format(
    'WITH u AS (UPDATE public.branch_members SET role = ''owner'' WHERE user_id = %L RETURNING 1) SELECT count(*)::text FROM u', a_admin));
  PERFORM pg_temp.check('Admin cannot change own membership', r, 'SELF_MODIFICATION_NOT_ALLOWED');

  r := pg_temp.run_as(a_admin, format(
    'WITH u AS (UPDATE public.branch_members SET permissions = ''["org:manage"]''::jsonb WHERE user_id = %L RETURNING 1) SELECT count(*)::text FROM u', a_vet));
  PERFORM pg_temp.check('Admin cannot write legacy custom permissions', r, 'LEGACY_CUSTOM_PERMISSIONS_READ_ONLY');

  r := pg_temp.run_as(a_admin, format('SELECT public.set_user_permission_restrictions(%L, ''{}'')::text', a_admin));
  PERFORM pg_temp.check('Admin cannot edit own restrictions', r, 'SELF_MODIFICATION_NOT_ALLOWED');

  r := pg_temp.run_as(a_admin, format('SELECT public.update_managed_user(%L, ''Vet'', null, ''owner'', null)::text', a_vet));
  PERFORM pg_temp.check('Admin cannot assign Central Admin role', r, 'ONLY_CENTRAL_ADMIN_CAN_ASSIGN_OWNER');

  r := pg_temp.run_as(a_vet, format('DELETE FROM public.user_permission_overrides WHERE user_id = %L', a_vet));
  PERFORM pg_temp.check('Managed user cannot write overrides table', r, 'permission denied');

  -- Restrictions narrow privileges (also in the database) -----------------
  r := pg_temp.run_as(a_owner, format(
    'SELECT public.set_user_permission_restrictions(%L, ARRAY[''billing:write''])::text', a_admin));
  PERFORM pg_temp.check('Owner restricts admin billing:write', r, '^OK:');

  r := pg_temp.run_as(a_admin, 'SELECT public.has_permission(''billing:write'')::text || public.has_permission(''billing:cancel'')::text || public.has_permission(''billing:read'')::text');
  PERFORM pg_temp.check('Restricted parent also removes child; read kept', r, '^OK:falsefalsetrue$');

  r := pg_temp.run_as(a_admin, format(
    'SELECT public.create_managed_invitation(''cash.%s@ca-test.invalid'', ''Caja'', null, %L, ''cashier'', ''{}'')::text', sfx, br_a1));
  PERFORM pg_temp.check('Restricted admin cannot invite role with billing:write', r, 'CANNOT_GRANT_PERMISSION:billing:write');

  r := pg_temp.run_as(a_admin, format(
    'SELECT public.set_user_permission_restrictions(%L, ''{}'')::text', a_vet));
  PERFORM pg_temp.check('Admin can manage a vet (no-op)', r, '^OK:');

  r := pg_temp.run_as(a_owner, format(
    'SELECT public.set_user_permission_restrictions(%L, ARRAY[''billing:read''])::text', a_recep));
  r := pg_temp.run_as(a_admin, format(
    'SELECT public.set_user_permission_restrictions(%L, ''{}'')::text', a_recep));
  PERFORM pg_temp.check('Admin can re-allow a permission they hold', r, '^OK:');

  r := pg_temp.run_as(a_owner, format(
    'SELECT public.set_user_permission_restrictions(%L, ARRAY[''patients:delete'', ''appointments:cancel''])::text', a_vet));
  r := pg_temp.run_as(a_vet, 'SELECT public.has_permission(''patients:write'')::text || public.has_permission(''patients:delete'')::text');
  PERFORM pg_temp.check('Child restriction keeps parent', r, '^OK:truefalse$');

  r := pg_temp.run_as(a_vet, format(
    'WITH u AS (UPDATE public.patients SET deleted_at = now() WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', patient_row));
  PERFORM pg_temp.check('DB blocks patient delete without patients:delete', r, 'PERMISSION_DENIED:patients:delete');

  r := pg_temp.run_as(a_vet, format(
    'WITH u AS (UPDATE public.patients SET name = ''Firulais II'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', patient_row));
  PERFORM pg_temp.check('Vet can still edit patient', r, '^OK:1$');

  r := pg_temp.run_as(a_admin, format(
    'SELECT public.set_user_permission_restrictions(%L, ''{}'')::text', a_owner));
  PERFORM pg_temp.check('Central Admin permissions cannot be restricted', r, 'SELF_MODIFICATION_NOT_ALLOWED|CENTRAL_ADMIN');

  -- Audit is append-only ---------------------------------------------------
  r := pg_temp.run_as(a_owner, 'WITH u AS (UPDATE public.audit_logs SET action = ''x'' RETURNING 1) SELECT count(*)::text FROM u');
  PERFORM pg_temp.check('Clinic user cannot update audit logs', r, 'permission denied');

  r := pg_temp.run_as(a_owner, 'WITH d AS (DELETE FROM public.audit_logs RETURNING 1) SELECT count(*)::text FROM d');
  PERFORM pg_temp.check('Clinic user cannot delete audit logs', r, 'permission denied');

  r := pg_temp.run_as(a_vet, format(
    'INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type) VALUES (%L, %L, ''user_suspended'', ''user'') RETURNING ''inserted''', org_a, a_vet));
  PERFORM pg_temp.check('Managed user cannot forge audit events', r, 'row-level security');

  BEGIN
    UPDATE public.audit_logs SET action = 'tampered' WHERE organization_id = org_b;
    PERFORM pg_temp.check('Even service role cannot rewrite audit rows', 'no error', 'AUDIT_LOG_IMMUTABLE');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.check('Even service role cannot rewrite audit rows', SQLERRM, 'AUDIT_LOG_IMMUTABLE');
  END;

  -- Central Admin protection -----------------------------------------------
  r := pg_temp.run_as(a_owner, format('SELECT public.set_managed_user_status(%L, ''suspended'', null)::text', a_owner));
  PERFORM pg_temp.check('Central Admin cannot suspend self', r, 'SELF_MODIFICATION_NOT_ALLOWED');

  r := pg_temp.run_as(a_admin, format('SELECT public.set_managed_user_status(%L, ''disabled'', null)::text', a_owner));
  PERFORM pg_temp.check('Admin cannot disable the Central Admin', r, 'CENTRAL_ADMIN_PROTECTED');

  r := pg_temp.run_as(a_admin, format(
    'WITH u AS (UPDATE public.profiles SET is_active = false WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', a_owner));
  PERFORM pg_temp.check('Admin cannot deactivate Central Admin via API', r, 'CENTRAL_ADMIN_PROTECTED');

  BEGIN
    UPDATE public.branch_members SET role = 'veterinarian' WHERE user_id = a_owner;
    PERFORM pg_temp.check('Last Central Admin cannot be demoted (service path)', 'no error', 'LAST_CENTRAL_ADMIN');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.check('Last Central Admin cannot be demoted (service path)', SQLERRM, 'LAST_CENTRAL_ADMIN');
  END;

  r := pg_temp.run_as(a_owner, format('SELECT public.update_managed_user(%L, ''Admin A'', null, ''owner'', null)::text', a_admin));
  PERFORM pg_temp.check('Central Admin can promote a second Central Admin', r, '^OK:');

  r := pg_temp.run_as(a_admin, format('SELECT public.update_managed_user(%L, ''Owner A'', null, ''admin'', null)::text', a_owner));
  PERFORM pg_temp.check('Second Central Admin can demote the first', r, '^OK:');

  r := pg_temp.run_as(a_owner, format('SELECT public.update_managed_user(%L, ''Admin A'', null, ''admin'', null)::text', a_admin));
  PERFORM pg_temp.check('Demoted user lost Central Admin powers', r, 'CENTRAL_ADMIN_PROTECTED|PERMISSION');

  -- Suspension blocks privileged actions -----------------------------------
  r := pg_temp.run_as(a_admin, format('SELECT public.set_managed_user_status(%L, ''suspended'', ''prueba'')::text', a_vet));
  PERFORM pg_temp.check('Central Admin suspends vet', r, '^OK:');

  r := pg_temp.run_as(a_vet, 'SELECT coalesce(public.get_user_organization_id()::text, ''none'') || public.has_permission(''patients:read'')::text');
  PERFORM pg_temp.check('Suspended user loses org context and permissions', r, '^OK:nonefalse$');

  r := pg_temp.run_as(a_vet, format(
    'INSERT INTO public.owners (organization_id, full_name) VALUES (%L, ''Hack'') RETURNING id::text', org_a));
  PERFORM pg_temp.check('Suspended user cannot create records', r, 'row-level security');

  r := pg_temp.run_as(a_vet, format(
    'WITH u AS (UPDATE public.patients SET name = ''x'' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', patient_row));
  PERFORM pg_temp.check('Suspended user cannot update records', r, '^OK:0$');

  -- Managed seat limit (Clinic B: only the Central Admin + 1 vet) ---------
  INSERT INTO public.managed_user_settings (organization_id, managed_user_limit) VALUES (org_b, 10);
  FOR i IN 1..9 LOOP
    r := pg_temp.run_as(b_owner, format(
      'SELECT public.create_managed_invitation(''seat%s.%s@ca-test.invalid'', ''Seat %s'', null, %L, ''receptionist'', ''{}'')::text',
      i, sfx, i, br_b1));
    EXIT WHEN r !~ '^OK:';
  END LOOP;
  PERFORM pg_temp.check('Seats 1-10 accepted (1 vet + 9 invitations)', r, '^OK:');

  r := pg_temp.run_as(b_owner, format(
    'SELECT public.create_managed_invitation(''seat11.%s@ca-test.invalid'', ''Seat 11'', null, %L, ''receptionist'', ''{}'')::text', sfx, br_b1));
  PERFORM pg_temp.check('Seat 11 rejected', r, 'MANAGED_USER_LIMIT_REACHED:10');

  r := pg_temp.run_as(b_owner, format('SELECT public.set_managed_user_status(%L, ''disabled'', null)::text', b_vet));
  r := pg_temp.run_as(b_owner, format(
    'SELECT public.create_managed_invitation(''seat11.%s@ca-test.invalid'', ''Seat 11'', null, %L, ''receptionist'', ''{}'')::text', sfx, br_b1));
  PERFORM pg_temp.check('Seat freed after disabling a user', r, '^OK:');

  r := pg_temp.run_as(b_owner, format('SELECT public.set_managed_user_status(%L, ''active'', null)::text', b_vet));
  PERFORM pg_temp.check('Reactivation blocked when seats are full', r, 'MANAGED_USER_LIMIT_REACHED');

  r := pg_temp.run_as(b_owner, format(
    'WITH u AS (UPDATE public.profiles SET is_active = true WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', b_vet));
  PERFORM pg_temp.check('Seat limit also enforced on direct API writes', r, 'MANAGED_USER_LIMIT_REACHED');

  -- Invitation acceptance --------------------------------------------------
  r := pg_temp.run_as(a_owner, format(
    'SELECT public.create_managed_invitation(''new.%s@ca-test.invalid'', ''Nueva Recepción'', ''+5491100000000'', %L, ''receptionist'', ARRAY[''billing:read''])::text',
    sfx, br_a2));
  PERFORM pg_temp.check('Central Admin invites with restrictions', r, '^OK:');
  inv_id := substr(r, 4)::UUID;

  r := pg_temp.run_as(a_owner, format('SELECT public.resend_managed_invitation(%L)::text', inv_id));
  PERFORM pg_temp.check('Resend invitation', r, '^OK:');

  invitee := pg_temp.mk_user('new.' || sfx || '@ca-test.invalid', NULL, NULL, NULL);
  r := pg_temp.run_as(invitee, 'SELECT public.accept_pending_invitation()::text');
  PERFORM pg_temp.check('Invited user accepts invitation', r, '"status": "accepted"');

  r := pg_temp.run_as(invitee, 'SELECT public.has_permission(''appointments:write'')::text || public.has_permission(''billing:read'')::text');
  PERFORM pg_temp.check('Accepted user gets role minus restrictions', r, '^OK:truefalse$');

  r := pg_temp.run_as(invitee, 'SELECT public.accept_pending_invitation()::text');
  PERFORM pg_temp.check('Invitation cannot be reused', r, 'already_member');

  r := pg_temp.run_as(b_owner, format('SELECT public.set_managed_user_status(%L, ''disabled'', null)::text', invitee));
  PERFORM pg_temp.check('Clinic B cannot disable Clinic A invitee', r, 'USER_NOT_FOUND');

  -- Audit trail ------------------------------------------------------------
  SELECT count(DISTINCT action)::TEXT INTO r
  FROM public.audit_logs
  WHERE organization_id IN (org_a, org_b)
    AND action IN ('user_invited', 'user_invitation_resent', 'user_activated', 'user_suspended',
                   'user_disabled', 'role_changed', 'permissions_updated');
  PERFORM pg_temp.check('User-management audit events recorded (7 kinds)', 'OK:' || r, '^OK:7$');

  r := pg_temp.run_as(a_owner, format(
    'SELECT count(*)::text FROM public.search_user_activity(%L, null, null, ''user_activated'', null, null, 1, 25)', invitee));
  PERFORM pg_temp.check('Central Admin sees invitee activity', r, '^OK:1$');

  -- Report (always rolls back) ---------------------------------------------
  SELECT string_agg(CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END || name || ' :: ' || detail, E'\n' ORDER BY seq),
         count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)
  INTO v_report, v_pass, v_fail
  FROM _results;

  RAISE EXCEPTION E'CENTRAL_ADMIN_TESTS\n%\nTOTAL pass=% fail=%', v_report, v_pass, v_fail;
END $$;

ROLLBACK;
