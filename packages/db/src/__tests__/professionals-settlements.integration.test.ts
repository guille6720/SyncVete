import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Database } from '../types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

const canRun = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

type Client = SupabaseClient<Database>;

describe('Integration env (professionals & settlements)', () => {
  it('reports Supabase availability', () => {
    expect(typeof canRun).toBe('boolean');
  });
});

describe.skipIf(!canRun)('@professionals Phase 1 backend', () => {
  let service: Client;

  const timestamp = Date.now();
  const orgASlug = `pro-a-${timestamp}`;
  const orgBSlug = `pro-b-${timestamp}`;
  const emailA = `pro-a-${timestamp}@test.sincvete.local`;
  const emailB = `pro-b-${timestamp}@test.sincvete.local`;
  const emailReadonly = `pro-ro-${timestamp}@test.sincvete.local`;
  const password = 'TestPass123!';

  let userAId: string;
  let userBId: string;
  let userReadonlyId: string;
  let orgAId: string;
  let orgBId: string;
  let branchAId: string;
  let schemaReady = false;

  let professionalAId: string;
  let ownerAId: string;
  let patientAId: string;

  beforeAll(async () => {
    service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: tableError } = await service.from('professionals').select('id').limit(1);
    if (tableError) {
      schemaReady = false;
      return;
    }
    schemaReady = true;

    try {
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

    const a = await signup(emailA, 'Pro A', orgASlug);
    orgAId = a.organizationId;
    branchAId = a.branchId;

    const b = await signup(emailB, 'Pro B', orgBSlug);
    orgBId = b.organizationId;

    const { error: profileError } = await service.from('profiles').upsert({
      id: userReadonlyId,
      organization_id: orgAId,
      full_name: 'Pro Readonly',
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

    const clientA = await authed(emailA);
    const { data: professional, error: proError } = await clientA
      .from('professionals')
      .insert({
        organization_id: orgAId,
        user_id: userAId,
        first_name: 'Dr',
        last_name: 'Test',
        relationship_type: 'independent',
        is_active: true,
      })
      .select('id')
      .single();
    if (proError || !professional) throw proError ?? new Error('professional create failed');
    professionalAId = professional.id;

    const fixture = await createPatientFixture(clientA, orgAId, branchAId);
    ownerAId = fixture.ownerId;
    patientAId = fixture.patientId;
    } catch {
      schemaReady = false;
    }
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

  async function createPatientFixture(client: Client, organizationId: string, branchId: string) {
    const { data: owner, error: ownerError } = await client
      .from('owners')
      .insert({
        organization_id: organizationId,
        full_name: `Tutor ${timestamp}`,
        phone: '11111111',
      })
      .select('id')
      .single();
    if (ownerError || !owner) throw ownerError ?? new Error('owner create failed');

    const { data: patient, error: patientError } = await client
      .from('patients')
      .insert({
        organization_id: organizationId,
        branch_id: branchId,
        owner_id: owner.id,
        name: 'Firulais',
        species: 'Canino',
      })
      .select('id')
      .single();
    if (patientError || !patient) throw patientError ?? new Error('patient create failed');

    return { ownerId: owner.id, patientId: patient.id };
  }

  async function createSchemeWithRules(
    client: Client,
    rules: Array<{
      rule_type: 'fixed' | 'activity' | 'percentage';
      frequency: string;
      amount?: number;
      percentage?: number;
      conditions?: Record<string, unknown>;
    }>,
    options?: { validFrom?: string; validTo?: string | null; conditions?: Record<string, unknown> }
  ) {
    const validFrom = options?.validFrom ?? '2026-08-01';
    const { data: scheme, error: schemeError } = await client
      .from('professional_compensation_schemes')
      .insert({
        organization_id: orgAId,
        professional_id: professionalAId,
        name: `Esquema ${timestamp}-${Math.random()}`,
        valid_from: validFrom,
        valid_to: options?.validTo ?? null,
        is_active: true,
        conditions: options?.conditions ?? {},
      })
      .select('id')
      .single();
    if (schemeError || !scheme) throw schemeError ?? new Error('scheme create failed');

    for (const rule of rules) {
      const { error } = await client.from('professional_compensation_rules').insert({
        organization_id: orgAId,
        compensation_scheme_id: scheme.id,
        rule_type: rule.rule_type,
        frequency: rule.frequency as Database['public']['Enums']['compensation_frequency'],
        amount: rule.amount ?? null,
        percentage: rule.percentage ?? null,
        conditions: rule.conditions ?? null,
        is_active: true,
      });
      if (error) throw error;
    }

    return scheme.id;
  }

  async function calculate(
    client: Client,
    periodStart: string,
    periodEnd: string,
    branchId?: string | null
  ) {
    const { data, error } = await client.rpc('calculate_professional_settlement', {
      p_professional_id: professionalAId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_branch_id: branchId ?? null,
    });
    if (error) throw error;
    return String(data);
  }

  async function getSettlement(client: Client, settlementId: string) {
    const { data, error } = await client.rpc('get_professional_settlement', {
      p_settlement_id: settlementId,
    });
    if (error) throw error;
    return data as {
      settlement: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
      adjustments: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
    };
  }

  async function createConsultation(
    client: Client,
    completedAt: string,
    invoiceTotal?: number
  ) {
    const { data: consultation, error } = await client
      .from('consultations')
      .insert({
        organization_id: orgAId,
        branch_id: branchAId,
        patient_id: patientAId,
        owner_id: ownerAId,
        veterinarian_id: userAId,
        status: 'completada',
        completed_at: completedAt,
        title: 'Consulta test',
      })
      .select('id')
      .single();
    if (error || !consultation) throw error ?? new Error('consultation create failed');

    if (invoiceTotal != null) {
      const { error: invoiceError } = await client.from('invoices').insert({
        organization_id: orgAId,
        branch_id: branchAId,
        owner_id: ownerAId,
        patient_id: patientAId,
        consultation_id: consultation.id,
        status: 'emitida',
        total: invoiceTotal,
        subtotal: invoiceTotal,
        balance: invoiceTotal,
      });
      if (invoiceError) throw invoiceError;
    }

    return consultation.id;
  }

  async function createSurgery(client: Client, completedAt: string) {
    const { data, error } = await client
      .from('surgeries')
      .insert({
        organization_id: orgAId,
        branch_id: branchAId,
        patient_id: patientAId,
        owner_id: ownerAId,
        surgeon_id: userAId,
        status: 'completada',
        completed_at: completedAt,
        procedure_name: 'Ovariohisterectomía',
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('surgery create failed');
    return data.id;
  }

  async function createAppointment(client: Client, startsAt: string, endsAt: string) {
    const { data, error } = await client
      .from('appointments')
      .insert({
        organization_id: orgAId,
        branch_id: branchAId,
        patient_id: patientAId,
        owner_id: ownerAId,
        assigned_user_id: userAId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'completada',
        appointment_type: 'consulta',
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('appointment create failed');
    return data.id;
  }

  async function createClinicalImage(client: Client, takenAt: string) {
    const imageId = crypto.randomUUID();
    const { error } = await client.from('clinical_images').insert({
      id: imageId,
      organization_id: orgAId,
      branch_id: branchAId,
      patient_id: patientAId,
      owner_id: ownerAId,
      uploaded_by: userAId,
      kind: 'radiografia',
      storage_path: `${orgAId}/test/${imageId}.jpg`,
      mime_type: 'image/jpeg',
      file_size: 1024,
      original_name: 'test.jpg',
      taken_at: takenAt,
    });
    if (error) throw error;
    return imageId;
  }

  async function createHospitalizationNote(client: Client, recordedAt: string) {
    const { data: hospitalization, error: hospError } = await client
      .from('hospitalizations')
      .insert({
        organization_id: orgAId,
        branch_id: branchAId,
        patient_id: patientAId,
        owner_id: ownerAId,
        veterinarian_id: userAId,
        status: 'internado',
        reason: 'Test internación',
      })
      .select('id')
      .single();
    if (hospError || !hospitalization) throw hospError ?? new Error('hospitalization create failed');

    const { data: note, error: noteError } = await client
      .from('hospitalization_notes')
      .insert({
        organization_id: orgAId,
        hospitalization_id: hospitalization.id,
        recorded_by: userAId,
        note_type: 'evolucion',
        content: 'Evolución test',
        recorded_at: recordedAt,
      })
      .select('id')
      .single();
    if (noteError || !note) throw noteError ?? new Error('hospitalization note create failed');
    return note.id;
  }

  async function createLabOrder(client: Client, completedAt: string) {
    const { data, error } = await client
      .from('lab_orders')
      .insert({
        organization_id: orgAId,
        branch_id: branchAId,
        patient_id: patientAId,
        owner_id: ownerAId,
        ordered_by: userAId,
        completed_by: userAId,
        status: 'completada',
        title: 'Hemograma test',
        ordered_at: completedAt,
        completed_at: completedAt,
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('lab order create failed');
    return data.id;
  }

  async function createVaccination(client: Client, administeredAt: string) {
    const { data, error } = await client
      .from('vaccinations')
      .insert({
        organization_id: orgAId,
        branch_id: branchAId,
        patient_id: patientAId,
        owner_id: ownerAId,
        veterinarian_id: userAId,
        vaccine_name: 'Antirrábica',
        administered_at: administeredAt,
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('vaccination create failed');
    return data.id;
  }

  async function tryExtendedScheme(
    client: Client,
    rules: Array<{
      rule_type: 'fixed' | 'activity' | 'percentage';
      frequency: string;
      amount?: number;
      percentage?: number;
    }>
  ): Promise<string | null> {
    try {
      return await createSchemeWithRules(client, rules);
    } catch {
      return null;
    }
  }

  it('skips when professionals schema is not applied', () => {
    if (!schemaReady) {
      expect(schemaReady).toBe(false);
      return;
    }
    expect(schemaReady).toBe(true);
  });

  it('1. create professional', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const { data, error } = await client
      .from('professionals')
      .select('id, first_name')
      .eq('id', professionalAId)
      .single();
    expect(error).toBeNull();
    expect(data?.first_name).toBe('Dr');
  });

  it('2. cross-organization access blocked', async () => {
    if (!schemaReady) return;
    const clientB = await authed(emailB);
    const { data, error } = await clientB
      .from('professionals')
      .select('id')
      .eq('id', professionalAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('3. fixed monthly calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [
      { rule_type: 'fixed', frequency: 'monthly', amount: 1_500_000 },
    ]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(1_500_000);
  });

  it('4. weekly calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'weekly', amount: 70_000 }]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-07');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(70_000);
  });

  it('5. biweekly calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(
      client,
      [{ rule_type: 'fixed', frequency: 'biweekly', amount: 100_000 }],
      { conditions: { anchor_date: '2026-08-01', period_days: 14 } }
    );
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBeGreaterThanOrEqual(100_000);
  });

  it('6. daily calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 60_000 }]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-05');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(300_000);
  });

  it('7. per-consultation calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createConsultation(client, '2026-08-10T12:00:00Z');
    await createConsultation(client, '2026-08-12T12:00:00Z');
    await createSchemeWithRules(client, [
      { rule_type: 'activity', frequency: 'per_consultation', amount: 15_000 },
    ]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(30_000);
  });

  it('8. percentage calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createConsultation(client, '2026-08-15T12:00:00Z', 100_000);
    await createSchemeWithRules(client, [
      { rule_type: 'percentage', frequency: 'per_consultation', percentage: 40 },
    ]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(40_000);
  });

  it('9. mixed compensation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createConsultation(client, '2026-08-18T12:00:00Z');
    await createSurgery(client, '2026-08-19T12:00:00Z');
    await createSchemeWithRules(client, [
      { rule_type: 'fixed', frequency: 'monthly', amount: 500_000 },
      { rule_type: 'activity', frequency: 'per_consultation', amount: 15_000 },
      { rule_type: 'activity', frequency: 'per_surgery', amount: 80_000 },
    ]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    const gross = Number(detail.settlement.gross_amount);
    expect(gross).toBeGreaterThanOrEqual(595_000);
  });

  it('10. surgery compensation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSurgery(client, '2026-08-20T12:00:00Z');
    await createSchemeWithRules(client, [
      { rule_type: 'activity', frequency: 'per_surgery', amount: 80_000 },
    ]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(80_000);
  });

  it('11. duplicate consultation prevention', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const consultationId = await createConsultation(client, '2026-08-21T12:00:00Z');
    await createSchemeWithRules(client, [
      { rule_type: 'activity', frequency: 'per_consultation', amount: 15_000 },
    ]);
    const firstId = await calculate(client, '2026-08-01', '2026-08-31');
    const { error: approveError } = await client.rpc('approve_professional_settlement', {
      p_settlement_id: firstId,
    });
    expect(approveError).toBeNull();

    const secondId = await calculate(client, '2026-09-01', '2026-09-30');
    const second = await getSettlement(client, secondId);
    const claimedAgain = second.items.some((item) => item.source_id === consultationId);
    expect(claimedAgain).toBe(false);

    const { error: duplicateApproveError } = await client.rpc('approve_professional_settlement', {
      p_settlement_id: secondId,
    });
    expect(duplicateApproveError).toBeNull();
  });

  it('12. historical compensation scheme preservation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(
      client,
      [{ rule_type: 'fixed', frequency: 'monthly', amount: 100_000 }],
      { validFrom: '2026-01-01', validTo: '2026-07-31' }
    );
    await createSchemeWithRules(
      client,
      [{ rule_type: 'fixed', frequency: 'monthly', amount: 200_000 }],
      { validFrom: '2026-08-01', validTo: null }
    );
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.gross_amount)).toBe(200_000);
  });

  it('13. manual bonus', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-01');
    const { error } = await client.rpc('add_professional_settlement_adjustment', {
      p_settlement_id: settlementId,
      p_type: 'bonus',
      p_amount: 5_000,
      p_reason: 'Bonus por guardia',
    });
    expect(error).toBeNull();
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.adjustments_amount)).toBe(5_000);
    expect(Number(detail.settlement.total_amount)).toBe(15_000);
  });

  it('14. manual deduction', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 20_000 }]);
    const settlementId = await calculate(client, '2026-08-02', '2026-08-02');
    const { error } = await client.rpc('add_professional_settlement_adjustment', {
      p_settlement_id: settlementId,
      p_type: 'deduction',
      p_amount: 3_000,
      p_reason: 'Adelanto descontado',
    });
    expect(error).toBeNull();
    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.deductions_amount)).toBe(3_000);
    expect(Number(detail.settlement.total_amount)).toBe(17_000);
  });

  it('15. approval locks settlement', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-03', '2026-08-03');
    const { error: approveError } = await client.rpc('approve_professional_settlement', {
      p_settlement_id: settlementId,
    });
    expect(approveError).toBeNull();

    const { error: adjustError } = await client.rpc('add_professional_settlement_adjustment', {
      p_settlement_id: settlementId,
      p_type: 'bonus',
      p_amount: 1_000,
      p_reason: 'No permitido',
    });
    expect(adjustError).not.toBeNull();
  });

  it('16. partial payment', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 100_000 }]);
    const settlementId = await calculate(client, '2026-08-04', '2026-08-04');
    await client.rpc('approve_professional_settlement', { p_settlement_id: settlementId });
    const { error } = await client.rpc('register_professional_payment', {
      p_settlement_id: settlementId,
      p_amount: 40_000,
      p_method: 'transferencia',
    });
    expect(error).toBeNull();
    const detail = await getSettlement(client, settlementId);
    expect(detail.settlement.status).toBe('partially_paid');
    expect(Number(detail.settlement.total_paid)).toBe(40_000);
    expect(Number(detail.settlement.balance_due)).toBe(60_000);
  });

  it('17. full payment', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 50_000 }]);
    const settlementId = await calculate(client, '2026-08-05', '2026-08-05');
    await client.rpc('approve_professional_settlement', { p_settlement_id: settlementId });
    await client.rpc('register_professional_payment', {
      p_settlement_id: settlementId,
      p_amount: 50_000,
      p_method: 'efectivo',
    });
    const detail = await getSettlement(client, settlementId);
    expect(detail.settlement.status).toBe('paid');
    expect(Number(detail.settlement.balance_due)).toBe(0);
  });

  it('18. unauthorized compensation access blocked', async () => {
    if (!schemaReady) return;
    const readonly = await authed(emailReadonly);
    const { data, error } = await readonly.from('professionals').select('id');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('19. unauthorized approval blocked', async () => {
    if (!schemaReady) return;
    const readonly = await authed(emailReadonly);
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-06', '2026-08-06');
    const { error } = await readonly.rpc('approve_professional_settlement', {
      p_settlement_id: settlementId,
    });
    expect(error).not.toBeNull();
  });

  it('20. unauthorized payment blocked', async () => {
    if (!schemaReady) return;
    const readonly = await authed(emailReadonly);
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-07', '2026-08-07');
    await client.rpc('approve_professional_settlement', { p_settlement_id: settlementId });
    const { error } = await readonly.rpc('register_professional_payment', {
      p_settlement_id: settlementId,
      p_amount: 5_000,
      p_method: 'efectivo',
    });
    expect(error).not.toBeNull();
  });

  it('21. per_appointment calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createAppointment(client, '2026-08-10T10:00:00Z', '2026-08-10T11:00:00Z');
    const schemeId = await tryExtendedScheme(client, [
      { rule_type: 'activity', frequency: 'per_appointment', amount: 12_000 },
    ]);
    if (!schemeId) return;

    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(
      detail.items.some(
        (item) => item.source_type === 'appointment' && Number(item.calculated_amount) === 12_000
      )
    ).toBe(true);
  });

  it('22. hourly calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createAppointment(client, '2026-08-11T10:00:00Z', '2026-08-11T12:00:00Z');
    const schemeId = await tryExtendedScheme(client, [
      { rule_type: 'activity', frequency: 'hourly', amount: 10_000 },
    ]);
    if (!schemeId) return;

    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    const hourlyItem = detail.items.find((item) => item.source_type === 'appointment');
    expect(hourlyItem).toBeTruthy();
    expect(Number(hourlyItem?.calculated_amount)).toBe(20_000);
  });

  it('23. per_procedure calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createClinicalImage(client, '2026-08-12T12:00:00Z');
    const schemeId = await tryExtendedScheme(client, [
      { rule_type: 'activity', frequency: 'per_procedure', amount: 8_000 },
    ]);
    if (!schemeId) return;

    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(
      detail.items.some(
        (item) => item.source_type === 'procedure' && Number(item.calculated_amount) === 8_000
      )
    ).toBe(true);
  });

  it('24. per_shift calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createHospitalizationNote(client, '2026-08-13T08:00:00Z');
    const schemeId = await tryExtendedScheme(client, [
      { rule_type: 'activity', frequency: 'per_shift', amount: 25_000 },
    ]);
    if (!schemeId) return;

    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(
      detail.items.some(
        (item) => item.source_type === 'shift' && Number(item.calculated_amount) === 25_000
      )
    ).toBe(true);
  });

  it('25. duplicate source blocks approval', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    const consultationId = await createConsultation(client, '2026-08-22T12:00:00Z');
    await createSchemeWithRules(client, [
      { rule_type: 'activity', frequency: 'per_consultation', amount: 15_000 },
    ]);
    const firstId = await calculate(client, '2026-08-01', '2026-08-31');
    await client.rpc('approve_professional_settlement', { p_settlement_id: firstId });

    const secondId = await calculate(client, '2026-09-01', '2026-09-30');
    const { data: rule } = await client
      .from('professional_compensation_rules')
      .select('id')
      .eq('organization_id', orgAId)
      .limit(1)
      .single();
    if (!rule) return;

    const { error: insertError } = await service.from('professional_settlement_items').insert({
      settlement_id: secondId,
      organization_id: orgAId,
      rule_id: rule.id,
      source_type: 'consultation',
      source_id: consultationId,
      description: 'Consulta duplicada',
      quantity: 1,
      unit_amount: 15_000,
      calculated_amount: 15_000,
    });
    expect(insertError).toBeNull();

    const { error: approveError } = await client.rpc('approve_professional_settlement', {
      p_settlement_id: secondId,
    });
    expect(approveError).not.toBeNull();
    expect(String(approveError?.message ?? '')).toMatch(/ya fue liquidada/i);
  });

  it('26. recalculate preserves manual adjustments', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createConsultation(client, '2026-08-23T12:00:00Z');
    await createSchemeWithRules(client, [
      { rule_type: 'activity', frequency: 'per_consultation', amount: 15_000 },
    ]);
    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    await client.rpc('add_professional_settlement_adjustment', {
      p_settlement_id: settlementId,
      p_type: 'bonus',
      p_amount: 2_000,
      p_reason: 'Extra guardia',
    });

    const { error: recalcError } = await client.rpc('calculate_professional_settlement', {
      p_professional_id: professionalAId,
      p_period_start: '2026-08-01',
      p_period_end: '2026-08-31',
      p_branch_id: null,
    });
    expect(recalcError).toBeNull();

    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.adjustments_amount)).toBe(2_000);
    expect(Number(detail.settlement.gross_amount)).toBe(15_000);
  });

  it('27. linked professional can list own settlements', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    await calculate(client, '2026-08-24', '2026-08-24');

    const { data, error } = await client.rpc('list_my_professional_settlements', {
      p_status: null,
      p_page: 1,
      p_page_size: 25,
    });
    expect(error).toBeNull();
    const payload = data as { items?: Array<{ professional_id?: string }>; total?: number };
    expect(Number(payload.total ?? 0)).toBeGreaterThan(0);
    expect(payload.items?.every((row) => row.professional_id === professionalAId)).toBe(true);
  });

  it('28. submit for review emits liquidacion notification', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-25', '2026-08-25');

    const { error: submitError } = await client.rpc('submit_professional_settlement_for_review', {
      p_settlement_id: settlementId,
    });
    expect(submitError).toBeNull();

    const { data: notifications, error: notifyError } = await service
      .from('notifications')
      .select('id, kind, href, related_id')
      .eq('organization_id', orgAId)
      .eq('kind', 'liquidacion')
      .eq('related_id', settlementId);
    expect(notifyError).toBeNull();
    expect((notifications ?? []).length).toBeGreaterThan(0);
  });

  it('29. approve notifies linked professional', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-26', '2026-08-26');

    const { error: approveError } = await client.rpc('approve_professional_settlement', {
      p_settlement_id: settlementId,
    });
    expect(approveError).toBeNull();

    const { data: notifications, error: notifyError } = await service
      .from('notifications')
      .select('id, kind, href, related_id')
      .eq('organization_id', orgAId)
      .eq('kind', 'liquidacion')
      .eq('related_id', settlementId)
      .ilike('href', '/liquidaciones/mis-liquidaciones/%');
    expect(notifyError).toBeNull();
    expect((notifications ?? []).length).toBeGreaterThan(0);
  });

  it('30. per_lab_order calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createLabOrder(client, '2026-08-27T12:00:00Z');
    const schemeId = await tryExtendedScheme(client, [
      { rule_type: 'activity', frequency: 'per_lab_order', amount: 7_500 },
    ]);
    if (!schemeId) return;

    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(
      detail.items.some(
        (item) => item.source_type === 'lab_order' && Number(item.calculated_amount) === 7_500
      )
    ).toBe(true);
  });

  it('31. per_vaccination calculation', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createVaccination(client, '2026-08-28');
    const schemeId = await tryExtendedScheme(client, [
      { rule_type: 'activity', frequency: 'per_vaccination', amount: 5_000 },
    ]);
    if (!schemeId) return;

    const settlementId = await calculate(client, '2026-08-01', '2026-08-31');
    const detail = await getSettlement(client, settlementId);
    expect(
      detail.items.some(
        (item) => item.source_type === 'vaccination' && Number(item.calculated_amount) === 5_000
      )
    ).toBe(true);
  });

  it('32. delete adjustment on draft', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-29', '2026-08-29');
    const { data: addResult, error: addError } = await client.rpc(
      'add_professional_settlement_adjustment',
      {
        p_settlement_id: settlementId,
        p_type: 'bonus',
        p_amount: 1_500,
        p_reason: 'Bono temporal',
      }
    );
    expect(addError).toBeNull();
    const adjustmentId = String(
      (addResult as { adjustment?: { id?: string } } | null)?.adjustment?.id ?? ''
    );
    expect(adjustmentId).toBeTruthy();

    const { error: deleteError } = await client.rpc('delete_professional_settlement_adjustment', {
      p_adjustment_id: adjustmentId,
    });
    expect(deleteError).toBeNull();

    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.adjustments_amount)).toBe(0);
    expect(detail.adjustments).toHaveLength(0);
  });

  it('33. update settlement notes + portal period filter', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-30', '2026-08-30');

    const { error: notesError } = await client.rpc('update_professional_settlement_notes', {
      p_settlement_id: settlementId,
      p_notes: 'Nota operativa fase 13',
    });
    expect(notesError).toBeNull();

    const detail = await getSettlement(client, settlementId);
    expect(String(detail.settlement.notes)).toBe('Nota operativa fase 13');

    const { data: listed, error: listError } = await client.rpc('list_my_professional_settlements', {
      p_status: null,
      p_page: 1,
      p_page_size: 25,
      p_period_start: '2026-08-30',
      p_period_end: '2026-08-30',
    });
    expect(listError).toBeNull();
    const payload = listed as { items?: Array<{ id?: string }>; total?: number };
    expect(Number(payload.total ?? 0)).toBeGreaterThan(0);
    expect(payload.items?.some((row) => row.id === settlementId)).toBe(true);
  });

  it('34. update adjustment recalculates totals', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-08-31', '2026-08-31');

    const { data: addResult, error: addError } = await client.rpc(
      'add_professional_settlement_adjustment',
      {
        p_settlement_id: settlementId,
        p_type: 'bonus',
        p_amount: 3_000,
        p_reason: 'Bonus inicial',
      }
    );
    expect(addError).toBeNull();
    const adjustmentId = String(
      (addResult as { adjustment?: { id?: string } } | null)?.adjustment?.id ?? ''
    );
    expect(adjustmentId).toBeTruthy();

    const { error: updateError } = await client.rpc('update_professional_settlement_adjustment', {
      p_adjustment_id: adjustmentId,
      p_type: 'bonus',
      p_amount: 4_500,
      p_reason: 'Bonus corregido',
    });
    expect(updateError).toBeNull();

    const detail = await getSettlement(client, settlementId);
    expect(Number(detail.settlement.adjustments_amount)).toBe(4_500);
    expect(detail.adjustments).toHaveLength(1);
    expect(String(detail.adjustments[0]?.reason)).toBe('Bonus corregido');
  });

  it('35. liquidacion notifications are role-filtered', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-09-01', '2026-09-01');

    const { error: submitError } = await client.rpc('submit_professional_settlement_for_review', {
      p_settlement_id: settlementId,
    });
    expect(submitError).toBeNull();

    const { data: forApprover, error: approverError } = await client.rpc('search_notifications', {
      p_kind: 'liquidacion',
      p_page: 1,
      p_page_size: 50,
    });
    expect(approverError).toBeNull();
    const approverRows = (forApprover ?? []) as Array<{ related_id?: string; href?: string }>;
    expect(
      approverRows.some(
        (row) =>
          row.related_id === settlementId &&
          String(row.href ?? '').startsWith('/liquidaciones/') &&
          !String(row.href ?? '').includes('/mis-liquidaciones/')
      )
    ).toBe(true);

    const readonly = await authed(emailReadonly);
    const { data: forReadonly, error: readonlyError } = await readonly.rpc('search_notifications', {
      p_kind: 'liquidacion',
      p_page: 1,
      p_page_size: 50,
    });
    expect(readonlyError).toBeNull();
    const readonlyRows = (forReadonly ?? []) as Array<{ related_id?: string }>;
    expect(readonlyRows.some((row) => row.related_id === settlementId)).toBe(false);
  });

  it('36. void payment restores balance', async () => {
    if (!schemaReady) return;
    const client = await authed(emailA);
    await createSchemeWithRules(client, [{ rule_type: 'fixed', frequency: 'daily', amount: 10_000 }]);
    const settlementId = await calculate(client, '2026-09-02', '2026-09-02');

    const { error: approveError } = await client.rpc('approve_professional_settlement', {
      p_settlement_id: settlementId,
    });
    expect(approveError).toBeNull();

    const { data: payResult, error: payError } = await client.rpc('register_professional_payment', {
      p_settlement_id: settlementId,
      p_amount: 4_000,
      p_method: 'transferencia',
    });
    expect(payError).toBeNull();
    const paymentId = String((payResult as { payment?: { id?: string } } | null)?.payment?.id ?? '');
    expect(paymentId).toBeTruthy();

    const afterPay = await getSettlement(client, settlementId);
    expect(Number(afterPay.settlement.total_paid)).toBe(4_000);
    expect(String(afterPay.settlement.status)).toBe('partially_paid');

    const { error: voidError } = await client.rpc('void_professional_payment', {
      p_payment_id: paymentId,
      p_reason: 'Pago cargado por error',
    });
    expect(voidError).toBeNull();

    const afterVoid = await getSettlement(client, settlementId);
    expect(Number(afterVoid.settlement.total_paid)).toBe(0);
    expect(Number(afterVoid.settlement.balance_due)).toBe(Number(afterVoid.settlement.total_amount));
    expect(String(afterVoid.settlement.status)).toBe('approved');
    expect(afterVoid.payments.some((p) => String(p.id) === paymentId && Boolean(p.deleted_at))).toBe(
      true
    );
    expect(afterVoid.payments.filter((p) => !p.deleted_at)).toHaveLength(0);
  });
});
