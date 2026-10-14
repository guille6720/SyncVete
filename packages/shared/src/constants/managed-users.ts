import type { Permission, Role } from './index';

/** Fallback when an organization has no managed_user_settings row (mirrors SQL managed_user_limit()). */
export const DEFAULT_MANAGED_USER_LIMIT = 10;

/**
 * Reference limits for future plan tiers. Not wired to billing yet: the effective limit is
 * managed_user_settings.managed_user_limit (default 10).
 */
export const MANAGED_USER_PLAN_LIMITS = {
  basic: 3,
  professional: 10,
  premium: 25,
} as const;

export const ACCOUNT_STATUSES = ['active', 'suspended', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type ManagedUserStatus = AccountStatus | 'invited';

export const MANAGED_USER_STATUS_LABELS: Record<ManagedUserStatus, string> = {
  active: 'Activo',
  invited: 'Invitado',
  suspended: 'Suspendido',
  disabled: 'Deshabilitado',
};

/** Roles a Central Admin can hand out when inviting (Central Admin is assigned by promotion). */
export const INVITABLE_ROLES: Role[] = [
  'admin',
  'veterinarian',
  'nurse',
  'receptionist',
  'cashier',
  'lab_tech',
  'readonly',
];

export interface PermissionMatrixAction {
  permission: Permission;
  label: string;
}

export interface PermissionMatrixModule {
  id: string;
  label: string;
  actions: PermissionMatrixAction[];
}

/**
 * Permission matrix shown to the Central Admin. Each checkbox maps to a real permission key
 * enforced by server actions and by SQL has_permission() (RLS).
 */
export const PERMISSION_MATRIX: PermissionMatrixModule[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    actions: [
      { permission: 'appointments:read', label: 'Ver' },
      { permission: 'appointments:write', label: 'Crear y editar' },
      { permission: 'appointments:cancel', label: 'Cancelar / eliminar' },
    ],
  },
  {
    id: 'patients',
    label: 'Pacientes y propietarios',
    actions: [
      { permission: 'patients:read', label: 'Ver' },
      { permission: 'patients:write', label: 'Crear y editar' },
      { permission: 'patients:delete', label: 'Eliminar' },
    ],
  },
  {
    id: 'clinical',
    label: 'Consultas e historia clínica',
    actions: [
      { permission: 'clinical:read', label: 'Ver' },
      { permission: 'clinical:write', label: 'Crear, editar y cerrar' },
    ],
  },
  {
    id: 'waiting_room',
    label: 'Sala de espera',
    actions: [
      { permission: 'waiting_room:read', label: 'Ver' },
      { permission: 'waiting_room:write', label: 'Gestionar' },
    ],
  },
  {
    id: 'professionals',
    label: 'Profesionales',
    actions: [
      { permission: 'professionals:read', label: 'Ver' },
      { permission: 'professionals:write', label: 'Gestionar' },
      { permission: 'professional_compensation:read', label: 'Ver compensación' },
      { permission: 'professional_compensation:write', label: 'Gestionar compensación' },
    ],
  },
  {
    id: 'interconsultations',
    label: 'Interconsultas',
    actions: [
      { permission: 'interconsultations:read', label: 'Ver' },
      { permission: 'interconsultations:write', label: 'Crear y gestionar' },
      { permission: 'interconsultations:approve', label: 'Aprobar' },
      { permission: 'interconsultations:billing', label: 'Facturar' },
    ],
  },
  {
    id: 'billing',
    label: 'Facturación y caja',
    actions: [
      { permission: 'billing:read', label: 'Ver' },
      { permission: 'billing:write', label: 'Crear, editar y cobrar' },
      { permission: 'billing:cancel', label: 'Anular' },
    ],
  },
  {
    id: 'settlements',
    label: 'Liquidaciones',
    actions: [
      { permission: 'professional_settlements:read', label: 'Ver' },
      { permission: 'professional_settlements:approve', label: 'Aprobar' },
      { permission: 'professional_settlements:pay', label: 'Pagar' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    actions: [
      { permission: 'inventory:read', label: 'Ver' },
      { permission: 'inventory:write', label: 'Gestionar' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    actions: [{ permission: 'whatsapp:send', label: 'Ver y enviar' }],
  },
  {
    id: 'reports',
    label: 'Reportes y auditoría',
    actions: [
      { permission: 'reports:read', label: 'Ver reportes' },
      { permission: 'audit:read', label: 'Ver auditoría y actividad' },
    ],
  },
  {
    id: 'data',
    label: 'Datos',
    actions: [
      { permission: 'data:import', label: 'Importar' },
      { permission: 'data:export', label: 'Exportar' },
    ],
  },
  {
    id: 'settings',
    label: 'Configuración',
    actions: [
      { permission: 'org:manage', label: 'Gestionar clínica y plan' },
      { permission: 'branch:manage', label: 'Gestionar sucursales' },
    ],
  },
  {
    id: 'users',
    label: 'Usuarios',
    actions: [{ permission: 'users:manage', label: 'Ver, invitar y gestionar permisos' }],
  },
];

/** User-management audit actions written by the managed-user RPCs. */
export const MANAGED_USER_AUDIT_ACTION_LABELS: Record<string, string> = {
  user_invited: 'Invitó a un usuario',
  user_invitation_resent: 'Reenvió una invitación',
  user_invitation_revoked: 'Revocó una invitación',
  user_activated: 'Activó su cuenta',
  user_updated: 'Editó un usuario',
  user_reactivated: 'Reactivó un usuario',
  user_suspended: 'Suspendió un usuario',
  user_disabled: 'Deshabilitó un usuario',
  user_sessions_revoked: 'Cerró las sesiones de un usuario',
  role_changed: 'Cambió el rol de un usuario',
  permissions_updated: 'Actualizó permisos',
};

/** Activity modules → audited tables (audit_logs.entity_type). */
export const ACTIVITY_MODULES: Array<{ id: string; label: string; entityTypes: string[] }> = [
  { id: 'users', label: 'Usuarios', entityTypes: ['user', 'user_invitation', 'user_permission_overrides', 'organization_invitations', 'branch_members', 'profiles'] },
  { id: 'agenda', label: 'Agenda', entityTypes: ['appointments', 'appointment_waitlist', 'professional_schedules', 'professional_time_blocks'] },
  { id: 'patients', label: 'Pacientes', entityTypes: ['patients'] },
  { id: 'owners', label: 'Propietarios', entityTypes: ['owners', 'owner_portal_invites'] },
  { id: 'clinical', label: 'Clínica', entityTypes: ['consultations', 'clinical_entries', 'hospitalizations', 'hospitalization_notes', 'vaccinations', 'surgeries', 'lab_orders', 'lab_order_items', 'prescriptions', 'clinical_images', 'ai_suggestions'] },
  { id: 'waiting_room', label: 'Sala de espera', entityTypes: ['waiting_room_entries', 'appointment_check_in_tokens'] },
  { id: 'billing', label: 'Facturación', entityTypes: ['invoices', 'invoice_items', 'payments'] },
  { id: 'cash', label: 'Caja', entityTypes: ['cash_sessions', 'cash_movements'] },
  { id: 'inventory', label: 'Inventario', entityTypes: ['inventory_products', 'inventory_movements'] },
  { id: 'professionals', label: 'Profesionales', entityTypes: ['professionals', 'professional_branches', 'professional_compensation_schemes', 'professional_compensation_rules'] },
  { id: 'settlements', label: 'Liquidaciones', entityTypes: ['professional_settlements', 'professional_payments', 'professional_settlement_adjustments', 'professional_settlement_item_omissions'] },
  { id: 'interconsultations', label: 'Interconsultas', entityTypes: ['interconsultations', 'interconsultation_requests', 'interconsultation_quotes', 'interconsultation_responses', 'interconsultation_billing_links', 'interconsultation_settlement_links'] },
  { id: 'whatsapp', label: 'WhatsApp', entityTypes: ['whatsapp_messages', 'reminder_logs'] },
  { id: 'settings', label: 'Configuración', entityTypes: ['organizations', 'branches', 'organization_subscriptions', 'organization_feature_overrides'] },
  { id: 'data', label: 'Datos', entityTypes: ['data_import_batches', 'data_export_jobs', 'data_migration'] },
];

const ENTITY_LABELS: Record<string, string> = {
  appointments: 'turno',
  patients: 'paciente',
  owners: 'propietario',
  consultations: 'consulta',
  clinical_entries: 'entrada de historia clínica',
  invoices: 'factura',
  payments: 'pago',
  cash_movements: 'movimiento de caja',
  cash_sessions: 'sesión de caja',
  professionals: 'profesional',
  interconsultations: 'interconsulta',
  waiting_room_entries: 'ingreso a sala de espera',
  whatsapp_messages: 'mensaje de WhatsApp',
  organizations: 'configuración de la clínica',
  branches: 'sucursal',
};

export function activityModuleForEntity(entityType: string): string {
  return ACTIVITY_MODULES.find((m) => m.entityTypes.includes(entityType))?.label ?? 'Otros';
}

/** Human summary for an activity row; never needs the clinical payload. */
export function describeActivity(input: {
  action: string;
  entityType: string;
  statusFrom?: string | null;
  statusTo?: string | null;
}): string {
  const managed = MANAGED_USER_AUDIT_ACTION_LABELS[input.action];
  if (managed) return managed;

  const entity = ENTITY_LABELS[input.entityType] ?? input.entityType.replace(/_/g, ' ');
  if (input.action === 'create') return `Creó ${entity}`;
  if (input.action === 'delete') return `Eliminó ${entity}`;
  if (input.action === 'update') {
    if (input.statusTo && input.statusTo !== input.statusFrom) {
      if (input.statusTo === 'cancelada' || input.statusTo === 'anulada') return `Canceló/anuló ${entity}`;
      if (input.statusTo === 'completada') return `Completó ${entity}`;
      return `Cambió estado de ${entity} a ${input.statusTo}`;
    }
    return `Actualizó ${entity}`;
  }
  return `${input.action} · ${entity}`;
}

/** Coarse browser/OS label from a stored user agent (no fingerprinting). */
export function summarizeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const ua = userAgent.toLowerCase();
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('chrome/') || ua.includes('crios/')
        ? 'Chrome'
        : ua.includes('firefox/') || ua.includes('fxios/')
          ? 'Firefox'
          : ua.includes('safari/')
            ? 'Safari'
            : 'Navegador';
  const os = ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
      ? 'iOS'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os') || ua.includes('macintosh')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Otro sistema';
  return `${browser} · ${os}`;
}

const MANAGED_USER_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: 'No tenés permisos para esta acción.',
  USER_NOT_FOUND: 'El usuario no existe en tu organización.',
  INVITATION_NOT_FOUND: 'La invitación no existe o ya no está pendiente.',
  INVALID_EMAIL: 'El email no es válido.',
  INVALID_BRANCH: 'La sucursal no pertenece a tu organización.',
  INVALID_STATUS: 'Estado inválido.',
  OWNER_ROLE_NOT_INVITABLE:
    'Para sumar otro administrador central, invitá al usuario y después promovelo desde su ficha.',
  ALREADY_MEMBER: 'Ese email ya pertenece a un usuario de tu organización.',
  EMAIL_IN_OTHER_ORGANIZATION: 'Ese email ya está asociado a otra organización.',
  INVITATION_ALREADY_PENDING: 'Ya hay una invitación pendiente para ese email.',
  SELF_MODIFICATION_NOT_ALLOWED: 'No podés modificar tu propio usuario, rol o permisos.',
  SELF_STATUS_CHANGE_NOT_ALLOWED: 'No podés cambiar el estado de tu propio usuario.',
  CENTRAL_ADMIN_PROTECTED: 'Solo un administrador central puede modificar a otro administrador central.',
  CENTRAL_ADMIN_PERMISSIONS_LOCKED: 'Los permisos del administrador central no se pueden restringir.',
  LAST_CENTRAL_ADMIN: 'La organización necesita al menos un administrador central activo.',
  ONLY_CENTRAL_ADMIN_CAN_ASSIGN_OWNER: 'Solo un administrador central puede asignar ese rol.',
  LEGACY_CUSTOM_PERMISSIONS_READ_ONLY: 'Los permisos se gestionan desde Usuarios y permisos.',
};

/**
 * Maps a database error (RAISE EXCEPTION code[:detail]) to a Spanish message.
 * Returns null when the error is not a known managed-user error.
 */
export function managedUserErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const limit = raw.match(/MANAGED_USER_LIMIT_REACHED:(\d+)/);
  if (limit) {
    return `Alcanzaste el límite de ${limit[1]} usuarios para tu organización.`;
  }

  const grant = raw.match(/CANNOT_GRANT_PERMISSION:([a-z_]+:[a-z_]+)/);
  if (grant) {
    return `No podés otorgar un permiso que vos no tenés (${grant[1]}).`;
  }

  const denied = raw.match(/PERMISSION_DENIED:([a-z_]+:[a-z_]+)/);
  if (denied) {
    return `No tenés permiso para esta acción (${denied[1]}).`;
  }

  const invalid = raw.match(/INVALID_PERMISSION:([^\s]+)/);
  if (invalid) {
    return `Permiso desconocido: ${invalid[1]}.`;
  }

  for (const [code, message] of Object.entries(MANAGED_USER_ERROR_MESSAGES)) {
    if (raw.includes(code)) return message;
  }
  return null;
}
