import { ROLE_LABELS, ROLE_PERMISSIONS, type Permission, type Role } from '../constants';

export type BranchMembershipLike = {
  branch_id: string;
  role: Role | string;
  permissions?: Permission[] | readonly Permission[] | null | unknown;
  created_at?: string | null;
};

/**
 * Canonical staff membership selection — must match PostgreSQL `has_permission`
 * and `get_session_bootstrap` consumers:
 * 1) membership for profiles.active_branch_id when present
 * 2) else earliest by created_at (stable order)
 */
export function pickEffectiveBranchMembership<T extends BranchMembershipLike>(
  memberships: readonly T[],
  activeBranchId: string | null | undefined
): T | null {
  if (!memberships.length) return null;
  if (activeBranchId) {
    const active = memberships.find((m) => m.branch_id === activeBranchId);
    if (active) return active;
  }
  const sorted = [...memberships].sort((a, b) => {
    const aAt = a.created_at ?? '';
    const bAt = b.created_at ?? '';
    if (aAt && bAt && aAt !== bAt) return aAt.localeCompare(bAt);
    return 0;
  });
  return sorted[0] ?? memberships[0] ?? null;
}

export function roleLabelForMembership(role: Role | string | null | undefined): string {
  if (!role) return 'Sin rol';
  if (role in ROLE_LABELS) return ROLE_LABELS[role as Role];
  return String(role);
}

/** Snapshot used to keep SQL `has_permission` CASE arms aligned with TS. */
export const SQL_HAS_PERMISSION_ROLE_KEYS = [
  'professionals:read',
  'professionals:write',
  'professional_compensation:read',
  'professional_compensation:write',
  'professional_settlements:read',
  'professional_settlements:approve',
  'professional_settlements:pay',
] as const;

export function roleHasProfessionalsWrite(role: Role, custom?: Permission[] | null): boolean {
  const perms =
    custom && custom.length > 0 ? custom : ROLE_PERMISSIONS[role];
  return perms.includes('professionals:write');
}

export function mapProfessionalsWriteDbError(error: {
  message?: string;
  code?: string;
} | null): string {
  const message = error?.message?.trim() ?? '';
  if (
    /row-level security|violates row-level security|permission denied|42501/i.test(message) ||
    error?.code === '42501'
  ) {
    return 'No tenés permisos para crear profesionales en esta clínica.';
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return 'Ya existe un registro conflictivo. Revisá email o documento.';
  }
  if (/schema cache|does not exist|Could not find the (table|column)/i.test(message)) {
    return 'Falta una migración de base de datos en este entorno. Contactá a soporte.';
  }
  if (!message) return 'No se pudo completar la operación';
  // Never surface raw Postgres internals to end users.
  return 'No se pudo guardar el profesional. Intentá de nuevo o contactá a soporte.';
}
