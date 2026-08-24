import { describe, expect, it } from 'vitest';
import { whatsappComposeSchema } from '../schemas';
import { buildWhatsAppComposePath } from '../constants/whatsapp';
import {
  buildWhatsAppUrl,
  normalizeWhatsAppPhone,
  pickOwnerWhatsAppPhone,
  renderWhatsAppTemplate,
} from '../utils/whatsapp';

describe('normalizeWhatsAppPhone', () => {
  it('normalizes Buenos Aires mobile with area code', () => {
    expect(normalizeWhatsAppPhone('11 2345-6789')).toBe('5491123456789');
  });

  it('keeps an international number', () => {
    expect(normalizeWhatsAppPhone('+54 9 11 2345-6789')).toBe('5491123456789');
  });

  it('converts the old 15 prefix', () => {
    expect(normalizeWhatsAppPhone('15 2345-6789')).toBe('5491123456789');
  });

  it('returns null for empty or too-short values', () => {
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone('123')).toBeNull();
  });
});

describe('pickOwnerWhatsAppPhone', () => {
  it('prefers the WhatsApp field', () => {
    expect(pickOwnerWhatsAppPhone('11 2345-6789', '1140000000')).toBe('5491123456789');
  });
});

describe('renderWhatsAppTemplate', () => {
  it('fills appointment reminder placeholders', () => {
    const body = renderWhatsAppTemplate('recordatorio_cita', {
      owner: 'Ana',
      patient: 'Luna',
      clinic: 'Clínica Sur',
      date: '12/08',
      time: '15:00',
    });
    expect(body).toContain('Ana');
    expect(body).toContain('Luna');
    expect(body).toContain('15:00');
  });

  it('fills waiting-room called template with optional room', () => {
    const withRoom = renderWhatsAppTemplate('sala_espera_llamado', {
      owner: 'Ana',
      patient: 'Luna',
      clinic: 'Clínica Sur',
      room: '2',
    });
    expect(withRoom).toContain('llamando a Luna');
    expect(withRoom).toContain('Consultorio 2');

    const withoutRoom = renderWhatsAppTemplate('sala_espera_llamado', {
      owner: 'Ana',
      patient: 'Luna',
      clinic: 'Clínica Sur',
    });
    expect(withoutRoom).toContain('Clínica Sur!');
    expect(withoutRoom).not.toContain('Consultorio');
  });
});

describe('buildWhatsAppUrl', () => {
  it('builds a wa.me link', () => {
    expect(buildWhatsAppUrl('5491123456789', 'Hola Ana')).toBe(
      'https://wa.me/5491123456789?text=Hola%20Ana'
    );
  });
});

describe('whatsappComposeSchema', () => {
  it('accepts a valid compose payload', () => {
    const result = whatsappComposeSchema.safeParse({
      ownerId: '11111111-1111-1111-1111-111111111111',
      body: 'Hola, te escribimos desde la clínica.',
      templateKey: 'mensaje_libre',
      phone: '11 2345-6789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body', () => {
    const result = whatsappComposeSchema.safeParse({
      ownerId: '11111111-1111-1111-1111-111111111111',
      body: '  ',
      templateKey: 'mensaje_libre',
      phone: '11 2345-6789',
    });
    expect(result.success).toBe(false);
  });
});

describe('buildWhatsAppComposePath', () => {
  it('includes owner and template', () => {
    expect(
      buildWhatsAppComposePath({
        ownerId: 'o1',
        template: 'factura_saldo',
      })
    ).toBe('/whatsapp?ownerId=o1&template=factura_saldo');
  });

  it('includes waiting-room called template and room', () => {
    expect(
      buildWhatsAppComposePath({
        ownerId: 'o1',
        appointmentId: 'a1',
        template: 'sala_espera_llamado',
        room: '3',
      })
    ).toBe(
      '/whatsapp?ownerId=o1&template=sala_espera_llamado&appointmentId=a1&room=3'
    );
  });
});
