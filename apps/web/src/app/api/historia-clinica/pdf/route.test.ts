import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { reportFixture } from '@/lib/clinical-history-report.fixture';

const mocks = vi.hoisted(() => ({ session: vi.fn(), load: vi.fn(), pdf: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSessionContext: mocks.session }));
vi.mock('@/lib/permissions', () => ({ PermissionError: class extends Error {} }));
vi.mock('@/lib/entitlements', () => ({
  isPlanRestrictionError: (error: unknown) =>
    error instanceof Error && error.message === 'PLAN_DENIED',
}));
vi.mock('@/lib/clinical-history-report-data', () => ({
  loadClinicalHistoryReport: mocks.load,
  HistoryReportError: class extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
}));
vi.mock('@/lib/clinical-history-pdf', () => ({ buildClinicalHistoryPdf: mocks.pdf }));
import { PermissionError } from '@/lib/permissions';
import { HistoryReportError } from '@/lib/clinical-history-report-data';
import { GET } from './route';

describe('private clinical history PDF download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ userId: 'actor' });
    mocks.load.mockResolvedValue(reportFixture());
    mocks.pdf.mockResolvedValue(new TextEncoder().encode('%PDF-test'));
  });
  const request = () =>
    new Request(
      `https://example.test/api/historia-clinica/pdf?patientId=${reportFixture().patient.id}&date=2026-10-28`
    );
  it('requires a signed-in session before accessing clinical data', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('downloads a PDF with private no-store headers and the selected date', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="historia-/);
    expect(mocks.load).toHaveBeenCalledWith({
      patientId: reportFixture().patient.id,
      date: '2026-10-28',
    });
  });
  it.each([
    [new PermissionError('denied'), 403],
    [new Error('PLAN_DENIED'), 403],
    [new HistoryReportError('secret patient', 404), 404],
    [new ZodError([]), 400],
    [new Error('private clinical content'), 500],
  ])('returns safe errors for denied or invalid exports', async (error, status) => {
    mocks.load.mockRejectedValue(error);
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).not.toMatch(/secret patient|private clinical content/);
  });
});
