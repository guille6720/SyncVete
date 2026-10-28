import { describe, expect, it } from 'vitest';
import {
  clinicalDay,
  clinicalDayRange,
  historyEntryFields,
  historyExportSchema,
  historyPdfFilename,
} from './clinical-history-report';
import { reportFixture } from './clinical-history-report.fixture';

describe('clinical history export scope', () => {
  it('uses the clinic day rather than the UTC or browser day', () => {
    expect(clinicalDay('2026-10-28T01:00:00Z')).toBe('2026-10-27');
    expect(clinicalDayRange('2026-10-28')).toEqual({
      from: '2026-10-28T03:00:00.000Z',
      to: '2026-10-29T03:00:00.000Z',
    });
  });
  it.each(['2026-02-30', '2026-13-01', '2026-10-28<script>', '28/10/2026'])(
    'rejects an invalid date %s',
    (date) => {
      expect(
        historyExportSchema.safeParse({ patientId: reportFixture().patient.id, date }).success
      ).toBe(false);
    }
  );
  it('does not truncate clinical text or discard zero measurements', () => {
    const entry = reportFixture().entries[0];
    entry.notes = 'Texto clínico completo '.repeat(120);
    entry.weight_kg = 0;
    expect(historyEntryFields(entry)).toContainEqual(['Notas', entry.notes]);
    expect(historyEntryFields(entry)).toContainEqual(['Peso', '0 kg']);
  });
  it('keeps filenames free of header and path injection', () => {
    const report = reportFixture();
    report.patient.name = 'Luná\r\n../"\u0000';
    expect(historyPdfFilename(report)).toBe('historia-Luna-completa.pdf');
  });
});
