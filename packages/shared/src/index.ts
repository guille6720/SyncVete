import { ROLE_PERMISSIONS, type Permission, type Role } from './constants';

export * from './constants';
export * from './constants/features';
export * from './constants/settings';
export * from './constants/data-migration';
export * from './constants/owners';
export * from './constants/patients';
export * from './constants/appointments';
export * from './constants/waiting-room';
export * from './constants/clinical';
export * from './constants/consultations';
export * from './constants/hospitalizations';
export * from './constants/vaccinations';
export * from './constants/surgeries';
export * from './constants/lab';
export * from './constants/inventory';
export * from './constants/billing';
export * from './constants/reports';
export * from './constants/portal';
export * from './constants/whatsapp';
export * from './constants/reminders';
export * from './constants/clinical-ai';
export * from './constants/pharmacy';
export * from './constants/cash';
export * from './constants/images';
export * from './constants/notifications';
export * from './constants/audit';
export * from './constants/professionals';
export * from './types';
export * from './types/dashboard';
export * from './types/appointments';
export * from './types/waiting-room';
export * from './types/clinical';
export * from './types/consultations';
export * from './types/hospitalizations';
export * from './types/vaccinations';
export * from './types/surgeries';
export * from './types/lab';
export * from './types/inventory';
export * from './types/billing';
export * from './types/reports';
export * from './types/portal';
export * from './types/whatsapp';
export * from './types/reminders';
export * from './types/clinical-ai';
export * from './types/pharmacy';
export * from './types/cash';
export * from './types/images';
export * from './types/notifications';
export * from './types/audit';
export * from './types/professionals';
export * from './schemas';
export * from './entitlements';
export * from './billing';

export function getPermissionsForRole(role: Role, custom?: Permission[] | null): Permission[] {
  if (custom && custom.length > 0) {
    return custom;
  }
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  permissions: Permission[],
  required: Permission | Permission[]
): boolean {
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((p) => permissions.includes(p));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

export * from './utils/settings';
export * from './utils/dashboard';
export * from './utils/appointments';
export * from './utils/waiting-room';
export * from './utils/clinical';
export * from './utils/hospitalizations';
export * from './utils/vaccinations';
export * from './utils/billing';
export * from './utils/reports';
export * from './utils/portal';
export * from './utils/whatsapp';
export * from './utils/reminders';
export * from './utils/clinical-ai';
export * from './utils/pharmacy';
export * from './utils/cash';
export * from './utils/images';
export * from './utils/notifications';
export * from './utils/audit';
export * from './utils/professionals';
