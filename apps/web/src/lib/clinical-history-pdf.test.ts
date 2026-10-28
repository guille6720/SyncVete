import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { extractText } from 'unpdf';
import { buildClinicalHistoryPdf } from './clinical-history-pdf';
import { reportFixture } from './clinical-history-report.fixture';

describe('complete, printable clinical history PDF', () => {
  it('preserves Spanish clinical text and patient identifiers', async () => {
    const report = reportFixture();
    report.entries[0].diagnosis =
      'Inflamación, revisión y evolución. Dosis: 5 µg. Niño, ñandú, corazón.';
    const bytes = await buildClinicalHistoryPdf(report);
    const result = await extractText(bytes, { mergePages: true });
    // The font's Unicode map treats micro sign and Greek mu as equivalent.
    expect(result.text.normalize('NFKC')).toContain(report.entries[0].diagnosis!.normalize('NFKC'));
    expect(result.text).toContain(report.patient.name);
    expect(result.text).toContain('Historia clínica completa');
  });
  it('flows long histories and unbroken words across A4 pages without losing the final record', async () => {
    const report = reportFixture();
    report.entries = Array.from({ length: 9 }, (_, index) => ({
      ...report.entries[0],
      id: String(index),
      notes: `${'Control de evolución y recomendaciones.\n'.repeat(18)}${'A'.repeat(650)}\nFinal clínico ${index}`,
    }));
    const bytes = await buildClinicalHistoryPdf(report);
    const pdf = await PDFDocument.load(bytes);
    // Optional, fictitious sample for visual QA of the actual application renderer.
    if (process.env.CLINICAL_HISTORY_PDF_QA)
      await writeFile(process.env.CLINICAL_HISTORY_PDF_QA, bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    const { text } = await extractText(bytes, { mergePages: true });
    expect(text).toContain('Final clínico 8');
    expect(text).toContain(`Página ${pdf.getPageCount()} de ${pdf.getPageCount()}`);
  });
  it('clearly labels a day without records', async () => {
    const report = reportFixture();
    report.entries = [];
    report.date = '2026-10-29';
    const { text } = await extractText(await buildClinicalHistoryPdf(report), { mergePages: true });
    expect(text).toContain('Atenciones del 29/10/2026');
    expect(text).toContain('No hay atenciones registradas');
  });
});
