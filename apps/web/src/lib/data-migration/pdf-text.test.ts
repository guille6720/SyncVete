import { describe, expect, it } from 'vitest';
import { pdfTextToCsv } from './pdf-text';

describe('pdfTextToCsv', () => {
  it('parses comma-separated PDF text', () => {
    const csv = pdfTextToCsv(
      ['external_product_id,name,quantity', 'P1,Amox,10', 'P2,Vacuna,3'].join('\n')
    );
    expect(csv).toContain('P1,Amox,10');
  });

  it('rejects empty text', () => {
    expect(() => pdfTextToCsv('   ')).toThrow(/texto extraíble/i);
  });
});
