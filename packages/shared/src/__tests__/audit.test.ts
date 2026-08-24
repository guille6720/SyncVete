import { describe, expect, it } from 'vitest';
import { auditLogListSchema } from '../schemas';
import {
  addDaysIso,
  auditChangedFields,
  auditEntityLabel,
  buildAuditEntityHref,
  formatAuditValue,
  isAuditAction,
  isValidAuditRange,
} from '../utils/audit';

describe('auditLogListSchema', () => {
  it('accepts filters', () => {
    const result = auditLogListSchema.safeParse({
      action: 'update',
      entityType: 'patients',
      from: '2026-08-01',
      to: '2026-08-12',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an inverted range', () => {
    const result = auditLogListSchema.safeParse({
      from: '2026-08-12',
      to: '2026-08-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('audit helpers', () => {
  it('labels known entities and actions', () => {
    expect(auditEntityLabel('invoices')).toBe('Facturas');
    expect(isAuditAction('create')).toBe(true);
    expect(isAuditAction('INSERT')).toBe(false);
  });

  it('builds entity hrefs', () => {
    expect(buildAuditEntityHref('patients', 'p1')).toBe('/pacientes/p1');
    expect(buildAuditEntityHref('payments', 'pay1', { invoice_id: 'inv1' })).toBe(
      '/facturacion/inv1'
    );
    expect(buildAuditEntityHref('professional_settlements', 'set1')).toBe('/liquidaciones/set1');
    expect(buildAuditEntityHref('professional_payments', 'pay1', { settlement_id: 'set1' })).toBe(
      '/liquidaciones/set1'
    );
    expect(buildAuditEntityHref('whatsapp_messages', 'm1')).toBe('/whatsapp');
  });

  it('diffs changed fields and skips noise', () => {
    const fields = auditChangedFields(
      { name: 'Luna', updated_at: 'a', organization_id: 'org', weight: 4 },
      { name: 'Luna', updated_at: 'b', organization_id: 'org', weight: 5 }
    );
    expect(fields).toEqual([{ key: 'weight', oldValue: 4, newValue: 5 }]);
  });

  it('formats values and validates ranges', () => {
    expect(formatAuditValue(true)).toBe('sí');
    expect(formatAuditValue(null)).toBe('—');
    expect(addDaysIso('2026-08-12', 1)).toBe('2026-08-13');
    expect(isValidAuditRange('2026-08-01', '2026-08-12')).toBe(true);
    expect(isValidAuditRange('2026-01-01', '2026-08-01')).toBe(false);
  });
});
