import { daysBetweenIso, formatIsoDateInTimeZone } from './reports';
import {
  AUDIT_ACTIONS,
  AUDIT_DEFAULT_RANGE_DAYS,
  AUDIT_DIFF_SKIP_KEYS,
  AUDIT_ENTITY_LABELS,
  AUDIT_MAX_RANGE_DAYS,
  type AuditAction,
  type AuditEntityType,
} from '../constants/audit';
import type { AuditChangedField } from '../types/audit';

export function defaultAuditRange(now = new Date()): { from: string; to: string } {
  const to = formatIsoDateInTimeZone(now);
  return { from: addDaysIso(to, -(AUDIT_DEFAULT_RANGE_DAYS - 1)), to };
}

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType as AuditEntityType] ?? entityType.replace(/_/g, ' ');
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const next = new Date(utc);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidAuditRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  if (from > to) return false;
  return daysBetweenIso(from, to) <= AUDIT_MAX_RANGE_DAYS;
}

export function auditRangeToTimestamps(from: string, to: string): { from: string; to: string } {
  return {
    from: new Date(`${from}T00:00:00-03:00`).toISOString(),
    to: new Date(`${addDaysIso(to, 1)}T00:00:00-03:00`).toISOString(),
  };
}

export function buildAuditEntityHref(
  entityType: string,
  entityId: string | null,
  data?: Record<string, unknown> | null
): string | null {
  const related = (key: string) => {
    const value = data?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  switch (entityType) {
    case 'patients':
      return entityId ? `/pacientes/${entityId}` : null;
    case 'owners':
      return entityId ? `/propietarios/${entityId}` : null;
    case 'appointments':
      return entityId ? `/agenda/${entityId}` : null;
    case 'clinical_entries':
      return entityId ? `/historia-clinica/${entityId}` : null;
    case 'consultations':
      return entityId ? `/consultas/${entityId}` : null;
    case 'hospitalizations':
      return entityId ? `/internacion/${entityId}` : null;
    case 'hospitalization_notes':
      return related('hospitalization_id')
        ? `/internacion/${related('hospitalization_id')}`
        : null;
    case 'vaccinations':
      return entityId ? `/vacunacion/${entityId}` : null;
    case 'surgeries':
      return entityId ? `/cirugias/${entityId}` : null;
    case 'lab_orders':
      return entityId ? `/laboratorio/${entityId}` : null;
    case 'lab_order_items':
      return related('lab_order_id') ? `/laboratorio/${related('lab_order_id')}` : null;
    case 'inventory_products':
      return entityId ? `/inventario/${entityId}` : null;
    case 'inventory_movements':
      return related('product_id') ? `/inventario/${related('product_id')}` : '/inventario';
    case 'invoices':
      return entityId ? `/facturacion/${entityId}` : null;
    case 'invoice_items':
    case 'payments':
      return related('invoice_id') ? `/facturacion/${related('invoice_id')}` : '/facturacion';
    case 'prescriptions':
      return entityId ? `/farmacia/${entityId}` : null;
    case 'cash_sessions':
      return entityId ? `/caja/${entityId}` : '/caja';
    case 'cash_movements':
      return related('cash_session_id') ? `/caja/${related('cash_session_id')}` : '/caja';
    case 'clinical_images':
      return entityId ? `/imagenes/${entityId}` : '/imagenes';
    case 'professionals':
      return entityId ? `/profesionales/${entityId}` : '/profesionales';
    case 'professional_settlements':
      return entityId ? `/liquidaciones/${entityId}` : '/liquidaciones';
    case 'professional_payments':
      return related('settlement_id') ? `/liquidaciones/${related('settlement_id')}` : '/liquidaciones';
    case 'professional_compensation_schemes':
      return related('professional_id')
        ? `/profesionales/${related('professional_id')}`
        : '/profesionales';
    case 'professional_compensation_rules':
      return '/profesionales';
    case 'professional_settlement_items':
      return related('settlement_id') ? `/liquidaciones/${related('settlement_id')}` : '/liquidaciones';
    case 'professional_settlement_adjustments':
      return related('settlement_id') ? `/liquidaciones/${related('settlement_id')}` : '/liquidaciones';
    case 'whatsapp_messages':
      return '/whatsapp';
    case 'reminder_logs':
      return '/recordatorios';
    case 'ai_suggestions':
      return '/ia-clinica';
    case 'organizations':
    case 'branches':
    case 'profiles':
    case 'branch_members':
    case 'organization_invitations':
      return '/configuracion';
    case 'owner_portal_invites':
      return related('owner_id') ? `/propietarios/${related('owner_id')}` : '/propietarios';
    default:
      return null;
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function auditChangedFields(
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined
): AuditChangedField[] {
  const skip = new Set<string>(AUDIT_DIFF_SKIP_KEYS);
  const keys = new Set([
    ...Object.keys(oldData ?? {}),
    ...Object.keys(newData ?? {}),
  ]);

  return [...keys]
    .filter((key) => !skip.has(key))
    .filter((key) => !jsonEqual(oldData?.[key], newData?.[key]))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      key,
      oldValue: oldData?.[key] ?? null,
      newValue: newData?.[key] ?? null,
    }));
}
