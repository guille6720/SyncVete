export const AUDIT_ACTIONS = ['create', 'update', 'delete'] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Alta',
  update: 'Cambio',
  delete: 'Baja',
};

export const AUDIT_ACTION_VARIANT: Record<
  AuditAction,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  create: 'success',
  update: 'warning',
  delete: 'destructive',
};

export const AUDIT_ENTITY_TYPES = [
  'patients',
  'owners',
  'appointments',
  'clinical_entries',
  'consultations',
  'hospitalizations',
  'hospitalization_notes',
  'vaccinations',
  'surgeries',
  'lab_orders',
  'lab_order_items',
  'inventory_products',
  'inventory_movements',
  'invoices',
  'invoice_items',
  'payments',
  'prescriptions',
  'cash_sessions',
  'cash_movements',
  'clinical_images',
  'whatsapp_messages',
  'reminder_logs',
  'ai_suggestions',
  'organizations',
  'branches',
  'profiles',
  'branch_members',
  'organization_invitations',
  'owner_portal_invites',
  'professionals',
  'professional_compensation_schemes',
  'professional_compensation_rules',
  'professional_settlements',
  'professional_settlement_items',
  'professional_settlement_item_omissions',
  'professional_settlement_adjustments',
  'professional_payments',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Virtual filter for search_audit_logs (not a real entity_type column value). */
export const AUDIT_LIQUIDACIONES_FAMILY = 'liquidaciones_family';

export const AUDIT_LIQUIDACIONES_FAMILY_ENTITY_TYPES = [
  'professionals',
  'professional_compensation_schemes',
  'professional_compensation_rules',
  'professional_settlements',
  'professional_settlement_items',
  'professional_settlement_item_omissions',
  'professional_settlement_adjustments',
  'professional_payments',
] as const satisfies readonly AuditEntityType[];

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  patients: 'Pacientes',
  owners: 'Propietarios',
  appointments: 'Citas',
  clinical_entries: 'Historia clínica',
  consultations: 'Consultas',
  hospitalizations: 'Internación',
  hospitalization_notes: 'Notas de internación',
  vaccinations: 'Vacunación',
  surgeries: 'Cirugías',
  lab_orders: 'Laboratorio',
  lab_order_items: 'Ítems de laboratorio',
  inventory_products: 'Inventario',
  inventory_movements: 'Movimientos de stock',
  invoices: 'Facturas',
  invoice_items: 'Ítems de factura',
  payments: 'Pagos',
  prescriptions: 'Recetas',
  cash_sessions: 'Caja',
  cash_movements: 'Movimientos de caja',
  clinical_images: 'Imágenes',
  whatsapp_messages: 'WhatsApp',
  reminder_logs: 'Recordatorios',
  ai_suggestions: 'IA clínica',
  organizations: 'Clínica',
  branches: 'Sucursales',
  profiles: 'Perfiles',
  branch_members: 'Equipo',
  organization_invitations: 'Invitaciones',
  owner_portal_invites: 'Portal',
  professionals: 'Profesionales',
  professional_compensation_schemes: 'Esquemas de compensación',
  professional_compensation_rules: 'Reglas de compensación',
  professional_settlements: 'Liquidaciones',
  professional_settlement_items: 'Ítems de liquidación',
  professional_settlement_item_omissions: 'Exclusiones de liquidación',
  professional_settlement_adjustments: 'Ajustes de liquidación',
  professional_payments: 'Pagos a profesionales',
};

export const AUDIT_DEFAULT_RANGE_DAYS = 7;
export const AUDIT_MAX_RANGE_DAYS = 92;

export const AUDIT_DIFF_SKIP_KEYS = [
  'updated_at',
  'organization_id',
  'id',
] as const;
