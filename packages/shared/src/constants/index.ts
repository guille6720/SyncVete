export const ROLES = [
  'owner',
  'admin',
  'veterinarian',
  'nurse',
  'receptionist',
  'cashier',
  'lab_tech',
  'readonly',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  veterinarian: 'Veterinario',
  nurse: 'Enfermero/a',
  receptionist: 'Recepcionista',
  cashier: 'Cajero/a',
  lab_tech: 'Técnico de laboratorio',
  readonly: 'Solo lectura',
};

export const PERMISSIONS = [
  'org:manage',
  'branch:manage',
  'users:manage',
  'patients:read',
  'patients:write',
  'appointments:read',
  'appointments:write',
  'clinical:read',
  'clinical:write',
  'billing:read',
  'billing:write',
  'inventory:read',
  'inventory:write',
  'reports:read',
  'audit:read',
  'whatsapp:send',
  'data:import',
  'data:export',
  'waiting_room:read',
  'waiting_room:write',
  'professionals:read',
  'professionals:write',
  'professional_compensation:read',
  'professional_compensation:write',
  'professional_settlements:read',
  'professional_settlements:approve',
  'professional_settlements:pay',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [
    'org:manage',
    'branch:manage',
    'users:manage',
    'patients:read',
    'patients:write',
    'appointments:read',
    'appointments:write',
    'clinical:read',
    'clinical:write',
    'billing:read',
    'billing:write',
    'inventory:read',
    'inventory:write',
    'reports:read',
    'audit:read',
    'whatsapp:send',
    'data:import',
    'data:export',
    'waiting_room:read',
    'waiting_room:write',
    'professionals:read',
    'professionals:write',
    'professional_compensation:read',
    'professional_compensation:write',
    'professional_settlements:read',
    'professional_settlements:approve',
    'professional_settlements:pay',
  ],
  veterinarian: [
    'patients:read',
    'patients:write',
    'appointments:read',
    'appointments:write',
    'clinical:read',
    'clinical:write',
    'inventory:read',
    'reports:read',
    'whatsapp:send',
    'data:export',
    'waiting_room:read',
    'waiting_room:write',
  ],
  nurse: [
    'patients:read',
    'patients:write',
    'appointments:read',
    'appointments:write',
    'clinical:read',
    'clinical:write',
    'inventory:read',
    'whatsapp:send',
    'waiting_room:read',
    'waiting_room:write',
  ],
  receptionist: [
    'patients:read',
    'patients:write',
    'appointments:read',
    'appointments:write',
    'billing:read',
    'whatsapp:send',
    'waiting_room:read',
    'waiting_room:write',
  ],
  cashier: [
    'patients:read',
    'appointments:read',
    'billing:read',
    'billing:write',
    'whatsapp:send',
    'waiting_room:read',
    'waiting_room:write',
    'professional_settlements:read',
    'professional_settlements:pay',
  ],
  lab_tech: [
    'patients:read',
    'clinical:read',
    'clinical:write',
    'inventory:read',
    'whatsapp:send',
    'waiting_room:read',
  ],
  readonly: [
    'patients:read',
    'appointments:read',
    'clinical:read',
    'reports:read',
    'waiting_room:read',
  ],
};

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const SEARCH_DEBOUNCE_MS = 300;

export const APP_NAME = 'SyncVete';
export const APP_LOCALE = 'es-AR';
export const APP_TIMEZONE = 'America/Argentina/Buenos_Aires';
/** Public production host (Y). Old I-spellings redirect here. */
export const APP_CANONICAL_HOST = 'syncvete.opusorg.com';
export const APP_LEGACY_HOSTS = [
  'sincvete.opusorg.com',
  'sinc-vete.opusorg.com',
  'www.sincvete.opusorg.com',
  'www.sinc-vete.opusorg.com',
  'www.syncvete.opusorg.com',
] as const;
