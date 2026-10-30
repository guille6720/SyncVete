import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportFixture } from './clinical-history-report.fixture';

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as Array<{ table: string; filters: Array<[string, string, unknown]> }>,
  authorize: vi.fn(),
  maxRows: 500,
}));
vi.mock('@/lib/permissions', () => ({ requirePermissionAndFeature: mocks.authorize }));
vi.mock('@/lib/entitlements', () => ({ FEATURES: { CLINICAL_HISTORY: 'clinical.history' } }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let range = [0, 100000];
      let single = false;
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters.push(['eq', key, value]);
          return builder;
        },
        is: (key: string, value: unknown) => {
          filters.push(['eq', key, value]);
          return builder;
        },
        in: (key: string, value: unknown[]) => {
          filters.push(['in', key, value]);
          return builder;
        },
        lte: (key: string, value: unknown) => {
          filters.push(['lte', key, value]);
          return builder;
        },
        gte: (key: string, value: unknown) => {
          filters.push(['gte', key, value]);
          return builder;
        },
        lt: (key: string, value: unknown) => {
          filters.push(['lt', key, value]);
          return builder;
        },
        order: () => builder,
        range: (from: number, to: number) => {
          range = [from, to];
          return builder;
        },
        maybeSingle: () => {
          single = true;
          return builder;
        },
        then(resolve: (result: unknown) => unknown) {
          mocks.calls.push({ table, filters });
          const rows = (mocks.tables[table] ?? [])
            .filter((row) =>
              filters.every(([op, key, value]) => {
                const actual = row[key] ?? null;
                if (op === 'eq') return actual === value;
                if (op === 'in') return (value as unknown[]).includes(actual);
                if (op === 'gte') return String(actual) >= String(value);
                if (op === 'lt') return String(actual) < String(value);
                return String(actual) <= String(value);
              })
            )
            .slice(range[0], Math.min(range[1] + 1, range[0] + mocks.maxRows));
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(
            resolve
          );
        },
      };
      return builder;
    },
  }),
}));
import { loadClinicalHistoryReport } from './clinical-history-report-data';

describe('authorized full clinical history loading', () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.maxRows = 500;
    mocks.authorize.mockReset();
    const fixture = reportFixture();
    const entry = fixture.entries[0];
    mocks.authorize.mockResolvedValue({
      kind: 'staff',
      organizationId: entry.organization_id,
      userId: 'actor',
    });
    mocks.tables = {
      branch_members: [
        {
          organization_id: entry.organization_id,
          user_id: 'actor',
          branch_id: entry.branch_id,
          is_active: true,
          deleted_at: null,
        },
      ],
      patients: [
        {
          ...fixture.patient,
          organization_id: entry.organization_id,
          branch_id: entry.branch_id,
          owner_id: entry.owner_id,
          deleted_at: null,
        },
      ],
      owners: [
        {
          id: entry.owner_id,
          organization_id: entry.organization_id,
          full_name: fixture.ownerName,
        },
      ],
      organizations: [{ id: entry.organization_id, name: fixture.clinicName }],
      branches: [
        { id: entry.branch_id, organization_id: entry.organization_id, name: entry.branchName },
      ],
      profiles: [],
      clinical_entries: [{ ...entry }],
    };
  });
  it('keeps the full text and binds every history query to patient, clinic and branches', async () => {
    mocks.tables.clinical_entries[0].notes = 'Historia completa '.repeat(100);
    const report = await loadClinicalHistoryReport({ patientId: reportFixture().patient.id });
    expect(report.entries[0].notes).toBe(mocks.tables.clinical_entries[0].notes);
    expect(mocks.authorize).toHaveBeenCalledWith('clinical:read', 'clinical.history');
    for (const call of mocks.calls.filter((call) => call.table === 'clinical_entries')) {
      expect(call.filters).toContainEqual([
        'eq',
        'organization_id',
        reportFixture().entries[0].organization_id,
      ]);
      expect(call.filters).toContainEqual(['eq', 'patient_id', report.patient.id]);
      expect(call.filters).toContainEqual([
        'in',
        'branch_id',
        [reportFixture().entries[0].branch_id],
      ]);
      expect(call.filters).toContainEqual(['eq', 'deleted_at', null]);
    }
  });
  it('fetches beyond 1000 rows even if the database caps a response below the requested page size', async () => {
    const source = mocks.tables.clinical_entries[0];
    mocks.tables.clinical_entries = Array.from({ length: 1002 }, (_, index) => ({
      ...source,
      id: String(index),
    }));
    mocks.maxRows = 200;
    const report = await loadClinicalHistoryReport({ patientId: reportFixture().patient.id });
    expect(report.entries).toHaveLength(1002);
    expect(new Set(report.entries.map((e) => e.id)).size).toBe(1002);
  });
  it('includes every entry inside the selected clinic day and excludes neighboring UTC boundaries', async () => {
    const source = mocks.tables.clinical_entries[0];
    mocks.tables.clinical_entries = [
      '2026-10-28T02:59:59Z',
      '2026-10-28T03:00:00Z',
      '2026-10-29T02:59:59Z',
      '2026-10-29T03:00:00Z',
    ].map((entry_date, i) => ({ ...source, id: String(i), entry_date }));
    expect(
      (
        await loadClinicalHistoryReport({
          patientId: reportFixture().patient.id,
          date: '2026-10-28',
        })
      ).entries.map((e) => e.id)
    ).toEqual(['1', '2']);
  });
  it('excludes archived entries and other branches', async () => {
    const source = mocks.tables.clinical_entries[0];
    mocks.tables.clinical_entries.push(
      { ...source, id: 'deleted', deleted_at: '2026-10-28T14:00:00Z' },
      { ...source, id: 'foreign-branch', branch_id: 'other' }
    );
    expect(
      (await loadClinicalHistoryReport({ patientId: reportFixture().patient.id })).entries
    ).toHaveLength(1);
  });
  it('does not export a different clinic by changing the patient UUID', async () => {
    mocks.tables.patients[0].organization_id = 'other';
    await expect(
      loadClinicalHistoryReport({ patientId: reportFixture().patient.id })
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.calls.some((call) => call.table === 'clinical_entries')).toBe(false);
  });
  it('denies a user without an active branch', async () => {
    mocks.tables.branch_members[0].is_active = false;
    await expect(
      loadClinicalHistoryReport({ patientId: reportFixture().patient.id })
    ).rejects.toMatchObject({ status: 403 });
  });
  it('stops before reading data if clinical permission or the plan feature is denied', async () => {
    mocks.authorize.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(
      loadClinicalHistoryReport({ patientId: reportFixture().patient.id })
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(mocks.calls).toHaveLength(0);
  });
});
