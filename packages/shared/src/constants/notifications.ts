export const NOTIFICATION_KINDS = [
  'cita',
  'laboratorio',
  'stock',
  'internacion',
  'factura',
  'receta',
  'plan',
  'migracion',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  cita: 'Cita',
  laboratorio: 'Laboratorio',
  stock: 'Stock',
  internacion: 'Internación',
  factura: 'Factura',
  receta: 'Receta',
  plan: 'Plan',
  migracion: 'Importar / Exportar',
};

export const NOTIFICATION_KIND_VARIANT: Record<
  NotificationKind,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  cita: 'default',
  laboratorio: 'success',
  stock: 'warning',
  internacion: 'destructive',
  factura: 'warning',
  receta: 'default',
  plan: 'warning',
  migracion: 'default',
};

export const NOTIFICATION_RELATED_TYPES = [
  'appointment',
  'waiting_room_entry',
  'lab_order',
  'inventory_product',
  'hospitalization',
  'invoice',
  'prescription',
  'plan_trial_ending',
  'plan_expired',
  'plan_past_due',
  'plan_quota',
  'plan_ending',
  'addon_ending',
  'addon_expired',
  'plan_refunded',
  'addon_refunded',
  'data_import_batch',
  'data_export_job',
] as const;

export type NotificationRelatedType = (typeof NOTIFICATION_RELATED_TYPES)[number];
