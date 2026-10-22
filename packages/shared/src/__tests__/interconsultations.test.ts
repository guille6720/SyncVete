import { describe, expect, it } from 'vitest';
import {
  buildInterconsultationInvoiceDescription,
  buildInterconsultationWhatsAppRequestMessage,
  canTransitionInterconsultationStatus,
  computeInterconsultationClientAmount,
} from '../utils/interconsultations';

describe('interconsultation utils', () => {
  it('computes clinic markup and client final amount', () => {
    expect(
      computeInterconsultationClientAmount({
        professionalBaseAmount: 10000,
        clinicMarkupPercentage: 20,
      })
    ).toEqual({ clinicMarkupAmount: 2000, clientFinalAmount: 12000 });
  });

  it('allows valid status transitions and blocks completed → approved', () => {
    expect(canTransitionInterconsultationStatus('draft', 'requesting')).toBe(true);
    expect(canTransitionInterconsultationStatus('quotes_received', 'approved')).toBe(true);
    expect(canTransitionInterconsultationStatus('completed', 'approved')).toBe(false);
    expect(canTransitionInterconsultationStatus('cancelled', 'draft')).toBe(false);
  });

  it('builds invoice description and whatsapp request copy', () => {
    expect(buildInterconsultationInvoiceDescription('Cardiología')).toBe(
      'Interconsulta profesional - Cardiología'
    );
    expect(
      buildInterconsultationWhatsAppRequestMessage({
        professionalName: 'Dra. Vega',
        clinicName: 'BMW Vet',
        patientName: 'Toby',
        url: 'https://example.test/t',
      })
    ).toContain('enlace seguro');
  });
});
