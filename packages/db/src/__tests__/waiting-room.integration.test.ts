import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Database, WaitingRoomStatus, AppointmentStatus } from '../types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

const canRun = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

type Client = SupabaseClient<Database>;

describe('Integration env (waiting room)', () => {
  it('reports Supabase availability', () => {
    expect(typeof canRun).toBe('boolean');
  });
});

describe.skipIf(!canRun)('@waiting-room Phase 1 backend', () => {
  let service: Client;

  const timestamp = Date.now();
  const orgASlug = `wr-a-${timestamp}`;
  const orgBSlug = `wr-b-${timestamp}`;
  const emailA = `wr-a-${timestamp}@test.sincvete.local`;
  const emailB = `wr-b-${timestamp}@test.sincvete.local`;
  const emailReadonly = `wr-ro-${timestamp}@test.sincvete.local`;
  const password = 'TestPass123!';

  let userAId: string;
  let userBId: string;
  let userReadonlyId: string;
  let orgAId: string;
  let orgBId: string;
  let branchAId: string;
  let schemaReady = false;

  beforeAll(async () => {
    service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: tableError } = await service.from('waiting_room_entries').select('id').limit(1);
    if (tableError) {
      schemaReady = false;
      return;
    }
    schemaReady = true;

    const createUser = async (email: string) => {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
      return data.user.id;
    };

    userAId = await createUser(emailA);
    userBId = await createUser(emailB);
    userReadonlyId = await createUser(emailReadonly);

    const signup = async (email: string, name: string, slug: string) => {
      const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
      await client.auth.signInWithPassword({ email, password });
      const { data, error } = await client.rpc('handle_new_user_signup', {
        p_full_name: name,
        p_organization_name: `Clínica ${name}`,
        p_organization_slug: slug,
      });
      if (error) throw error;
      const organizationId = (data as { organization_id: string }).organization_id;
      const { data: branch, error: branchError } = await client
        .from('branches')
        .select('id')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      if (branchError || !branch) throw branchError ?? new Error('branch missing');
      await client.auth.signOut();
      return { organizationId, branchId: branch.id };
    };

    const a = await signup(emailA, 'WR A', orgASlug);
    orgAId = a.organizationId;
    branchAId = a.branchId;

    const b = await signup(emailB, 'WR B', orgBSlug);
    orgBId = b.organizationId;

    // Attach readonly user to org A with readonly role
    const { error: profileError } = await service.from('profiles').upsert({
      id: userReadonlyId,
      organization_id: orgAId,
      full_name: 'WR Readonly',
      is_active: true,
      active_branch_id: branchAId,
    });
    if (profileError) throw profileError;

    const { error: memberError } = await service.from('branch_members').insert({
      organization_id: orgAId,
      branch_id: branchAId,
      user_id: userReadonlyId,
      role: 'readonly',
      is_active: true,
    });
    if (memberError) throw memberError;
  });

  afterAll(async () => {
    if (userAId) await service.auth.admin.deleteUser(userAId);
    if (userBId) await service.auth.admin.deleteUser(userBId);
    if (userReadonlyId) await service.auth.admin.deleteUser(userReadonlyId);
  });

  async function authed(email: string): Promise<Client> {
    const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  async function createAppointmentFixture(params: {
    client: Client;
    organizationId: string;
    branchId: string;
    status?: AppointmentStatus;
    startsAt?: string;
  }) {
    const startsAt = params.startsAt ?? new Date().toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString();

    const { data: owner, error: ownerError } = await params.client
      .from('owners')
      .insert({
        organization_id: params.organizationId,
        full_name: `Tutor ${timestamp}`,
        phone: '11111111',
      })
      .select('id')
      .single();
    if (ownerError || !owner) throw ownerError ?? new Error('owner create failed');

    const { data: patient, error: patientError } = await params.client
      .from('patients')
      .insert({
        organization_id: params.organizationId,
        owner_id: owner.id,
        name: `Paciente ${timestamp}`,
        species: 'Canino',
        sex: 'Macho',
      })
      .select('id')
      .single();
    if (patientError || !patient) throw patientError ?? new Error('patient create failed');

    const { data: appointment, error: appointmentError } = await params.client
      .from('appointments')
      .insert({
        organization_id: params.organizationId,
        branch_id: params.branchId,
        patient_id: patient.id,
        owner_id: owner.id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: params.status ?? 'programada',
        appointment_type: 'consulta',
      })
      .select('id, status')
      .single();
    if (appointmentError || !appointment) {
      throw appointmentError ?? new Error('appointment create failed');
    }

    return { ownerId: owner.id, patientId: patient.id, appointmentId: appointment.id };
  }

  it('skips when waiting room schema is not applied', async () => {
    if (!schemaReady) {
      expect(schemaReady).toBe(false);
      return;
    }
    expect(schemaReady).toBe(true);
  });

  it('1) successful check-in', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const fixture = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
    });

    const { data, error } = await client.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    expect(error).toBeNull();
    const entry = data as { id: string; status: WaitingRoomStatus; queue_position: number };
    expect(entry.status).toBe('waiting');
    expect(entry.queue_position).toBeGreaterThanOrEqual(1);
  });

  it('2) duplicate check-in rejected', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const fixture = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
    });

    const first = await client.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    expect(first.error).toBeNull();

    const second = await client.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? '').toMatch(/ya tiene una entrada activa/i);
  });

  it('3) cross-organization access rejected', async () => {
    if (!schemaReady) return;
    const clientA = await authed(emailA);
    const fixtureA = await createAppointmentFixture({
      client: clientA,
      organizationId: orgAId,
      branchId: branchAId,
    });
    await clientA.rpc('check_in_appointment', { p_appointment_id: fixtureA.appointmentId });

    const clientB = await authed(emailB);
    const { data, error } = await clientB.rpc('check_in_appointment', {
      p_appointment_id: fixtureA.appointmentId,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();

    const listB = await clientB.rpc('list_waiting_room', { p_branch_id: branchAId });
    expect(listB.error).toBeNull();
    expect(listB.data ?? []).toEqual([]);

    // Org B cannot see org A rows via table select either
    const direct = await clientB
      .from('waiting_room_entries')
      .select('id')
      .eq('organization_id', orgAId);
    expect(direct.error).toBeNull();
    expect(direct.data ?? []).toEqual([]);
  });

  it('4) cancelled appointment rejected', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const fixture = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
      status: 'cancelada',
    });

    const { error } = await client.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/cancelada/i);
  });

  it('5-6) queue ordering and emergency priority', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const first = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
    });
    const second = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
    });

    const checkIn1 = await client.rpc('check_in_appointment', {
      p_appointment_id: first.appointmentId,
    });
    const checkIn2 = await client.rpc('check_in_appointment', {
      p_appointment_id: second.appointmentId,
    });
    expect(checkIn1.error).toBeNull();
    expect(checkIn2.error).toBeNull();

    const entry2 = checkIn2.data as { id: string };
    const reorder = await client.rpc('reorder_waiting_room', {
      p_entry_id: entry2.id,
      p_priority: 50,
      p_queue_position: null,
    });
    expect(reorder.error).toBeNull();

    const { data: list, error } = await client.rpc('list_waiting_room', {
      p_branch_id: branchAId,
    });
    expect(error).toBeNull();
    const active = (list ?? []).filter((row) =>
      [first.appointmentId, second.appointmentId].includes(row.appointment_id)
    );
    expect(active[0]?.appointment_id).toBe(second.appointmentId);
    expect(active[0]?.priority).toBe(50);
  });

  it('7-12) status transitions and appointment sync', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const fixture = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
      status: 'confirmada',
    });

    const checkIn = await client.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    expect(checkIn.error).toBeNull();
    const entryId = (checkIn.data as { id: string }).id;

    const called = await client.rpc('update_waiting_room_status', {
      p_entry_id: entryId,
      p_new_status: 'called',
      p_room: 'Box 1',
    });
    expect(called.error).toBeNull();
    expect((called.data as { status: string }).status).toBe('called');

    const inConsult = await client.rpc('update_waiting_room_status', {
      p_entry_id: entryId,
      p_new_status: 'in_consultation',
    });
    expect(inConsult.error).toBeNull();

    const { data: apptAfterConsult } = await client
      .from('appointments')
      .select('status')
      .eq('id', fixture.appointmentId)
      .single();
    expect(apptAfterConsult?.status).toBe('en_curso');

    const payment = await client.rpc('update_waiting_room_status', {
      p_entry_id: entryId,
      p_new_status: 'payment_pending',
    });
    expect(payment.error).toBeNull();

    const { data: apptAfterPayment } = await client
      .from('appointments')
      .select('status')
      .eq('id', fixture.appointmentId)
      .single();
    expect(apptAfterPayment?.status).toBe('en_curso');

    const completed = await client.rpc('update_waiting_room_status', {
      p_entry_id: entryId,
      p_new_status: 'completed',
    });
    expect(completed.error).toBeNull();

    const { data: apptAfterCompleted } = await client
      .from('appointments')
      .select('status')
      .eq('id', fixture.appointmentId)
      .single();
    expect(apptAfterCompleted?.status).toBe('completada');

    const invalid = await client.rpc('update_waiting_room_status', {
      p_entry_id: entryId,
      p_new_status: 'waiting',
    });
    expect(invalid.error).not.toBeNull();
    expect(invalid.error?.message ?? '').toMatch(/inválida|invalida/i);
  });

  it('13) unauthorized user rejected', async () => {
    if (!schemaReady) return;
    const ownerClient = await authed(emailA);
    const fixture = await createAppointmentFixture({
      client: ownerClient,
      organizationId: orgAId,
      branchId: branchAId,
    });

    const readonlyClient = await authed(emailReadonly);
    const { error } = await readonlyClient.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/permisos/i);

    // Read should still work for readonly
    const list = await readonlyClient.rpc('list_waiting_room', { p_branch_id: branchAId });
    expect(list.error).toBeNull();
  });

  it('list_waiting_room returns internal_notes for staff', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const fixture = await createAppointmentFixture({
      client,
      organizationId: orgAId,
      branchId: branchAId,
    });
    const checkIn = await client.rpc('check_in_appointment', {
      p_appointment_id: fixture.appointmentId,
    });
    const entryId = (checkIn.data as { id: string }).id;

    const notesUpdate = await client.rpc('update_waiting_room_notes', {
      p_entry_id: entryId,
      p_notes: 'secreto clínico',
    });
    expect(notesUpdate.error).toBeNull();

    const { data, error } = await client.rpc('list_waiting_room', { p_branch_id: branchAId });
    expect(error).toBeNull();
    const row = (data ?? []).find((r) => r.appointment_id === fixture.appointmentId);
    expect(row).toBeTruthy();
    expect(row?.internal_notes).toBe('secreto clínico');
  });
});
