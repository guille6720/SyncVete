export const INVOICE_STATUSES = [
  'borrador',
  'emitida',
  'pagada',
  'anulada',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  pagada: 'Pagada',
  anulada: 'Anulada',
};

export const INVOICE_STATUS_VARIANT: Record<
  InvoiceStatus,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  borrador: 'default',
  emitida: 'warning',
  pagada: 'success',
  anulada: 'destructive',
};

export const PAYMENT_METHODS = [
  'efectivo',
  'transferencia',
  'tarjeta',
  'mercadopago',
  'gratuito',
  'otro',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mercadopago: 'Mercado Pago',
  gratuito: 'Gratuito',
  otro: 'Otro',
};

export const INVOICE_SERVICE_PRESETS = [
  { description: 'Consulta clínica', unitPrice: 25000 },
  { description: 'Consulta de control', unitPrice: 18000 },
  { description: 'Consulta de emergencia', unitPrice: 45000 },
  { description: 'Vacunación', unitPrice: 22000 },
  { description: 'Desparasitación', unitPrice: 8000 },
  { description: 'Castración / OH', unitPrice: 80000 },
  { description: 'Internación (día)', unitPrice: 35000 },
  { description: 'Hemograma', unitPrice: 18000 },
  { description: 'Bioquímica sanguínea', unitPrice: 22000 },
  { description: 'Ecografía', unitPrice: 40000 },
  { description: 'Radiografía', unitPrice: 28000 },
  { description: 'Limpieza dental', unitPrice: 55000 },
] as const;
