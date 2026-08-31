export const CURRENCIES = [
  { code: 'ARS', label: 'Peso argentino (ARS)' },
  { code: 'USD', label: 'Dólar estadounidense (USD)' },
  { code: 'UYU', label: 'Peso uruguayo (UYU)' },
  { code: 'CLP', label: 'Peso chileno (CLP)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
] as const;

export const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Argentina/Cordoba', label: 'Córdoba (GMT-3)' },
  { value: 'America/Montevideo', label: 'Montevideo (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
] as const;

export const PERMISSION_LABELS: Record<string, string> = {
  'org:manage': 'Gestionar clínica',
  'branch:manage': 'Gestionar sucursales',
  'users:manage': 'Gestionar usuarios',
  'patients:read': 'Ver pacientes',
  'patients:write': 'Editar pacientes',
  'appointments:read': 'Ver agenda',
  'appointments:write': 'Gestionar agenda',
  'waiting_room:read': 'Ver sala de espera',
  'waiting_room:write': 'Gestionar sala de espera',
  'clinical:read': 'Ver historias clínicas',
  'clinical:write': 'Editar historias clínicas',
  'billing:read': 'Ver facturación',
  'billing:write': 'Gestionar facturación',
  'inventory:read': 'Ver inventario',
  'inventory:write': 'Gestionar inventario',
  'reports:read': 'Ver reportes',
  'audit:read': 'Ver auditoría',
  'whatsapp:send': 'Enviar WhatsApp',
  'professionals:read': 'Ver profesionales',
  'professionals:write': 'Gestionar profesionales',
  'professional_compensation:read': 'Ver compensación',
  'professional_compensation:write': 'Gestionar compensación',
  'professional_settlements:read': 'Ver liquidaciones',
  'professional_settlements:approve': 'Aprobar liquidaciones',
  'professional_settlements:pay': 'Registrar pagos a profesionales',
  'interconsultations:read': 'Ver interconsultas',
  'interconsultations:write': 'Gestionar interconsultas',
  'interconsultations:approve': 'Aprobar presupuestos de interconsulta',
  'interconsultations:billing': 'Facturar interconsultas',
};

export const BRANCH_COOKIE_NAME = 'sincvete_branch_id';
