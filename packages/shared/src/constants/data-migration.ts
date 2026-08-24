/** SyncVete data import/export — pure helpers (no DB I/O). */

export const DATA_MIGRATION_FORMAT_VERSION = '1.6';
export const DATA_MIGRATION_FORMAT = 'syncvete-migration';

export const IMPORT_TYPES = [
  'branches',
  'owners',
  'patients',
  'clinical_entries',
  'vaccinations',
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
  'appointments',
  'consultations',
  'inventory_products',
  'invoices',
  'payments',
  'attachments',
  'full_migration',
  'migration_zip',
] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  branches: 'Sucursales',
  owners: 'Propietarios',
  patients: 'Pacientes',
  clinical_entries: 'Historias clínicas',
  vaccinations: 'Vacunaciones',
  lab_orders: 'Laboratorio',
  surgeries: 'Cirugías',
  prescriptions: 'Recetas / farmacia',
  hospitalizations: 'Internaciones',
  appointments: 'Agenda / citas',
  consultations: 'Consultas',
  inventory_products: 'Inventario / farmacia',
  invoices: 'Facturas (con ítems)',
  payments: 'Pagos (sin caja)',
  attachments: 'Adjuntos (ZIP)',
  full_migration: 'Migración completa (guiada)',
  migration_zip: 'Paquete ZIP SyncVete',
};

export const IMPORT_ENTITY_TYPES = [
  'branches',
  'owners',
  'patients',
  'clinical_entries',
  'vaccinations',
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
  'appointments',
  'consultations',
  'inventory_products',
  'invoices',
  'payments',
] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const DEFAULT_IMPORT_CHUNK_SIZE = 50;

/** Hard caps for clinic uploads (fase 11). */
export const MAX_IMPORT_CSV_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ZIP_BYTES = 80 * 1024 * 1024;
export const MAX_EXPORT_ARTIFACT_BYTES = 200 * 1024 * 1024;

/** Ordered steps for guided full clinic migration (fase 6). */
export const FULL_MIGRATION_STEPS = [
  'branches',
  'owners',
  'patients',
  'clinical_entries',
  'vaccinations',
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
  'appointments',
  'consultations',
  'inventory_products',
  'invoices',
  'payments',
  'attachments',
] as const;
export type FullMigrationStep = (typeof FULL_MIGRATION_STEPS)[number];

export const FULL_MIGRATION_STEP_LABELS: Record<FullMigrationStep, string> = {
  branches: '1. Sucursales',
  owners: '2. Propietarios',
  patients: '3. Pacientes',
  clinical_entries: '4. Historias clínicas',
  vaccinations: '5. Vacunaciones',
  lab_orders: '6. Laboratorio',
  surgeries: '7. Cirugías',
  prescriptions: '8. Recetas',
  hospitalizations: '9. Internaciones',
  appointments: '10. Agenda / citas',
  consultations: '11. Consultas',
  inventory_products: '12. Inventario',
  invoices: '13. Facturas',
  payments: '14. Pagos',
  attachments: '15. Adjuntos ZIP',
};

/** Phase 41: which guided steps consume branch_map / staff_map (for readiness hints). */
export const FULL_MIGRATION_STEP_MAP_USAGE: Record<
  FullMigrationStep,
  { branch: boolean; staff: boolean }
> = {
  branches: { branch: false, staff: false },
  owners: { branch: true, staff: false },
  patients: { branch: true, staff: false },
  clinical_entries: { branch: true, staff: true },
  vaccinations: { branch: true, staff: true },
  lab_orders: { branch: true, staff: true },
  surgeries: { branch: true, staff: true },
  prescriptions: { branch: true, staff: true },
  hospitalizations: { branch: true, staff: true },
  appointments: { branch: true, staff: true },
  consultations: { branch: true, staff: true },
  inventory_products: { branch: true, staff: false },
  invoices: { branch: true, staff: true },
  payments: { branch: false, staff: true },
  attachments: { branch: false, staff: false },
};

export function nextFullMigrationStep(current: FullMigrationStep): FullMigrationStep | null {
  const idx = FULL_MIGRATION_STEPS.indexOf(current);
  if (idx < 0 || idx >= FULL_MIGRATION_STEPS.length - 1) return null;
  return FULL_MIGRATION_STEPS[idx + 1] ?? null;
}

export function previousFullMigrationStep(current: FullMigrationStep): FullMigrationStep | null {
  const idx = FULL_MIGRATION_STEPS.indexOf(current);
  if (idx <= 0) return null;
  return FULL_MIGRATION_STEPS[idx - 1] ?? null;
}

export const DATA_MIGRATION_AUDIT_ACTIONS = {
  importCompleted: 'data_import.completed',
  importRolledBack: 'data_import.rolled_back',
  importQueued: 'data_import.queued',
  importCancelled: 'data_import.cancelled',
  importRetried: 'data_import.retried',
  exportCompleted: 'data_export.completed',
  exportQueued: 'data_export.queued',
  exportCancelled: 'data_export.cancelled',
  exportDownloaded: 'data_export.downloaded',
  locksReleased: 'data_migration.locks_released',
  orphansPruned: 'data_migration.orphans_pruned',
  cutoverPackDownloaded: 'data_migration.cutover_pack_downloaded',
} as const;

export const IDEMPOTENCY_MODES = ['off', 'skip_existing_source'] as const;
export type IdempotencyMode = (typeof IDEMPOTENCY_MODES)[number];

export const IDEMPOTENCY_MODE_LABELS: Record<IdempotencyMode, string> = {
  off: 'Sin idempotencia (crear según decisiones)',
  skip_existing_source: 'Omitir si ya existe source_record_id en el tenant',
};

export const EXPORT_TYPES = [
  'branches',
  'owners',
  'patients',
  'clinical_entries',
  'vaccinations',
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
  'appointments',
  'consultations',
  'inventory_products',
  'invoices',
  'payments',
  'cash_sessions',
  'inventory_movements',
  'clinical_images',
  'reminder_logs',
  'whatsapp_messages',
  'audit_logs',
  'notifications',
  'staff_profiles',
  'patient_clinical',
  'full_clinic',
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
  branches: 'Sucursales',
  owners: 'Propietarios',
  patients: 'Pacientes',
  clinical_entries: 'Historias clínicas',
  vaccinations: 'Vacunaciones',
  lab_orders: 'Laboratorio (con ítems)',
  surgeries: 'Cirugías',
  prescriptions: 'Recetas (con ítems)',
  hospitalizations: 'Internaciones (con notas)',
  appointments: 'Agenda / citas',
  consultations: 'Consultas',
  inventory_products: 'Inventario / farmacia',
  invoices: 'Facturas (con ítems y pagos)',
  payments: 'Pagos',
  cash_sessions: 'Caja (sesiones + movimientos)',
  inventory_movements: 'Inventario (movimientos de stock)',
  clinical_images: 'Adjuntos clínicos (metadata)',
  reminder_logs: 'Recordatorios (historial)',
  whatsapp_messages: 'WhatsApp (historial)',
  audit_logs: 'Auditoría (historial)',
  notifications: 'Notificaciones (historial)',
  staff_profiles: 'Staff (perfiles + membresías)',
  patient_clinical: 'Historia de un paciente',
  full_clinic: 'Exportación completa de la clínica',
};

export const SPECIALTY_EXPORT_TYPES = [
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
] as const;
export type SpecialtyExportType = (typeof SPECIALTY_EXPORT_TYPES)[number];

export function isSpecialtyExportType(value: string): value is SpecialtyExportType {
  return (SPECIALTY_EXPORT_TYPES as readonly string[]).includes(value);
}

/** Phase 47: child entity files included in specialty ZIP (besides parent CSV/JSON). */
export const SPECIALTY_EXPORT_CHILD_FILES: Record<SpecialtyExportType, readonly string[]> = {
  lab_orders: ['lab_order_items'],
  prescriptions: ['prescription_items'],
  hospitalizations: ['hospitalization_notes'],
  surgeries: [],
};

/**
 * Phase 48/49: companion basenames for focused single-entity ZIP/JSON (not full_clinic /
 * patient_clinical / specialty). Specialty children use SPECIALTY_EXPORT_CHILD_FILES.
 */
export const FOCUSED_EXPORT_ZIP_COMPANIONS: Partial<Record<ExportType, readonly string[]>> = {
  cash_sessions: ['cash_movements'],
  invoices: ['invoice_items', 'invoice_payments'],
  staff_profiles: ['staff_memberships'],
};

/** Phase 49: camelCase JSON keys for focused primary entities. */
export const FOCUSED_EXPORT_JSON_KEYS: Partial<Record<ExportType, string>> = {
  branches: 'branches',
  owners: 'owners',
  patients: 'patients',
  clinical_entries: 'clinicalEntries',
  vaccinations: 'vaccinations',
  lab_orders: 'labOrders',
  surgeries: 'surgeries',
  prescriptions: 'prescriptions',
  hospitalizations: 'hospitalizations',
  appointments: 'appointments',
  consultations: 'consultations',
  inventory_products: 'inventoryProducts',
  invoices: 'invoices',
  payments: 'invoicePayments',
  cash_sessions: 'cashSessions',
  inventory_movements: 'inventoryMovements',
  clinical_images: 'clinicalImages',
  reminder_logs: 'reminderLogs',
  whatsapp_messages: 'whatsappMessages',
  audit_logs: 'auditLogs',
  notifications: 'notifications',
  staff_profiles: 'staffProfiles',
};

/** Phase 49: camelCase JSON keys for companion / specialty child basenames. */
export const FOCUSED_EXPORT_COMPANION_JSON_KEYS: Record<string, string> = {
  cash_movements: 'cashMovements',
  invoice_items: 'invoiceItems',
  invoice_payments: 'invoicePayments',
  staff_memberships: 'staffMemberships',
  lab_order_items: 'labOrderItems',
  prescription_items: 'prescriptionItems',
  hospitalization_notes: 'hospitalizationNotes',
};

/** Phase 49: build focused JSON payload (manifest + primary + companions). */
export function buildFocusedExportJsonPayload(input: {
  exportType: ExportType;
  manifest: unknown;
  primaryRows: unknown;
  companionRowsByBasename: Record<string, unknown>;
}): Record<string, unknown> {
  const primaryKey = FOCUSED_EXPORT_JSON_KEYS[input.exportType] ?? input.exportType;
  const payload: Record<string, unknown> = {
    manifest: input.manifest,
    [primaryKey]: input.primaryRows,
  };
  const companions = isSpecialtyExportType(input.exportType)
    ? SPECIALTY_EXPORT_CHILD_FILES[input.exportType]
    : (FOCUSED_EXPORT_ZIP_COMPANIONS[input.exportType] ?? []);
  for (const basename of companions) {
    const jsonKey = FOCUSED_EXPORT_COMPANION_JSON_KEYS[basename];
    if (!jsonKey) continue;
    if (Object.prototype.hasOwnProperty.call(input.companionRowsByBasename, basename)) {
      payload[jsonKey] = input.companionRowsByBasename[basename];
    }
  }
  return payload;
}

/** Inclusive YYYY-MM-DD range; returns null bounds when empty/invalid. */
export function normalizeExportDateRange(input?: {
  dateFrom?: string | null;
  dateTo?: string | null;
}): { dateFrom: string | null; dateTo: string | null } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const dateFrom = input?.dateFrom && iso.test(input.dateFrom) ? input.dateFrom : null;
  const dateTo = input?.dateTo && iso.test(input.dateTo) ? input.dateTo : null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { dateFrom: dateTo, dateTo: dateFrom };
  }
  return { dateFrom, dateTo };
}

export const EXPORT_FORMATS = ['csv', 'json', 'xlsx', 'pdf', 'zip'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const DATE_LOCALES = ['es-AR', 'en-US', 'iso'] as const;
export type DateLocale = (typeof DATE_LOCALES)[number];

export const CONFLICT_POLICIES = ['create', 'link', 'skip', 'review'] as const;
export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number];

export const CONFLICT_DECISION_LABELS: Record<ConflictPolicy, string> = {
  create: 'Crear nuevo',
  link: 'Vincular existente',
  skip: 'Omitir fila',
  review: 'Revisar',
};

export type ImportFieldDef = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

/** Optional multi-branch mapping (Phase 23+). Empty → session/default branch. */
export const EXTERNAL_BRANCH_IMPORT_FIELD: ImportFieldDef = {
  key: 'external_branch_id',
  label: 'ID externo sucursal',
  aliases: ['external_branch_id', 'branch_id', 'id_sucursal', 'sucursal_id'],
};

/** Optional staff mapping (Phase 35+). Empty → default importer / null per entity. */
export const EXTERNAL_ASSIGNED_USER_IMPORT_FIELD: ImportFieldDef = {
  key: 'external_assigned_user_id',
  label: 'ID externo profesional',
  aliases: [
    'external_assigned_user_id',
    'assigned_user_id',
    'veterinarian_id',
    'id_profesional',
    'profesional',
    'vet_id',
  ],
};

export function resolveImportBranchId(input: {
  externalBranchId: string | null | undefined;
  branchIdByExternal?: Record<string, string>;
  /** Phase 40: accept org branch UUIDs for round-trip (same pattern as staff). */
  knownBranchInternalIds?: Set<string>;
  defaultBranchId: string;
}): { ok: true; branchId: string } | { ok: false; reason: 'unmapped_branch' } {
  const ext = (input.externalBranchId ?? '').trim();
  if (!ext) return { ok: true, branchId: input.defaultBranchId };
  const mapped = input.branchIdByExternal?.[ext];
  if (mapped) return { ok: true, branchId: mapped };
  if (input.knownBranchInternalIds?.has(ext)) return { ok: true, branchId: ext };
  return { ok: false, reason: 'unmapped_branch' };
}

/** Phase 35/36: optional assigned staff. Empty → defaultUserId (or null). */
export function resolveImportStaffUserId(input: {
  externalAssignedUserId: string | null | undefined;
  userIdByExternal?: Record<string, string>;
  knownStaffInternalIds?: Set<string>;
  /** Used when external id is empty (e.g. importer user for clinical rows). */
  defaultUserId?: string | null;
}): { ok: true; userId: string | null } | { ok: false; reason: 'unmapped_staff' } {
  const ext = (input.externalAssignedUserId ?? '').trim();
  if (!ext) return { ok: true, userId: input.defaultUserId ?? null };
  const mapped = input.userIdByExternal?.[ext];
  if (mapped) return { ok: true, userId: mapped };
  if (input.knownStaffInternalIds?.has(ext)) return { ok: true, userId: ext };
  return { ok: false, reason: 'unmapped_staff' };
}

export function pushUnmappedStaffIssue(
  issues: Array<{
    rowNumber: number;
    entityType: string;
    field?: string;
    code: string;
    message: string;
    severity: 'error' | 'warning';
    recommendedAction?: string;
    sourceReference?: string;
  }>,
  rowNumber: number,
  entityType: string,
  externalAssignedUserId: string | null | undefined,
  knownStaffExternalIds?: Set<string>,
  knownStaffInternalIds?: Set<string>
): void {
  const ext = (externalAssignedUserId ?? '').trim();
  if (!ext) return;
  if (knownStaffExternalIds?.has(ext)) return;
  if (knownStaffInternalIds?.has(ext)) return;
  issues.push({
    rowNumber,
    entityType,
    field: 'external_assigned_user_id',
    code: 'unmapped_staff',
    message:
      'Profesional externo no mapeado; cargá mapa staff (external_staff_id → internal_user_id) o usá un profile id del tenant',
    severity: 'error',
    recommendedAction: 'Exportá staff_profiles y armá el mapa, o quitá external_assigned_user_id',
    sourceReference: ext,
  });
}

export const STAFF_MAP_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_staff_id',
    label: 'ID externo staff',
    required: true,
    aliases: ['external_staff_id', 'staff_id', 'external_user_id', 'user_id', 'id_profesional'],
  },
  {
    key: 'internal_user_id',
    label: 'ID interno SyncVete (profile)',
    required: true,
    aliases: ['internal_user_id', 'profile_id', 'user_uuid', 'id_interno'],
  },
];

export function buildStaffMapTemplateCsv(): string {
  return toCsv(STAFF_MAP_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_staff_id: 'VET-LEGACY-01',
      internal_user_id: '00000000-0000-4000-8000-000000000001',
    },
  ]);
}

/** Phase 39: branch map template for cutover pack (external → internal UUID). */
export const BRANCH_MAP_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_branch_id',
    label: 'ID externo sucursal',
    required: true,
    aliases: ['external_branch_id', 'branch_id', 'id_sucursal', 'sucursal_id'],
  },
  {
    key: 'internal_branch_id',
    label: 'ID interno SyncVete (branch)',
    required: true,
    aliases: ['internal_branch_id', 'branch_uuid', 'id_interno'],
  },
];

export function buildBranchMapTemplateCsv(): string {
  return toCsv(BRANCH_MAP_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_branch_id: 'BR-001',
      internal_branch_id: '00000000-0000-4000-8000-0000000000b1',
    },
  ]);
}

export function parseBranchMapCsv(csvText: string): {
  map: Record<string, string>;
  issues: Array<{ rowNumber: number; message: string }>;
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const map: Record<string, string> = {};
  const issues: Array<{ rowNumber: number; message: string }> = [];
  if (lines.length === 0) return { map, issues };
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const extIdx = header.findIndex((h) =>
    ['external_branch_id', 'branch_id', 'id_sucursal', 'sucursal_id'].includes(h)
  );
  const intIdx = header.findIndex((h) =>
    ['internal_branch_id', 'branch_uuid', 'id_interno'].includes(h)
  );
  if (extIdx < 0 || intIdx < 0) {
    issues.push({
      rowNumber: 1,
      message: 'Cabeceras requeridas: external_branch_id, internal_branch_id',
    });
    return { map, issues };
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const externalId = cols[extIdx] ?? '';
    const internalId = cols[intIdx] ?? '';
    if (!externalId || !internalId) {
      issues.push({ rowNumber: i + 1, message: 'Fila incompleta' });
      continue;
    }
    map[externalId] = internalId;
  }
  return { map, issues };
}

export const CUTOVER_PACK_VERSION = 4;

export function buildCutoverRoundtripNotes(formatVersion?: string): string {
  const version = formatVersion ?? DATA_MIGRATION_FORMAT_VERSION;
  return [
    'SyncVete — Notas de round-trip (cutover pack v4)',
    `Formato migración: ${DATA_MIGRATION_FORMAT} ${version}`,
    '',
    '1. Exportá staff_profiles y armá staff_map.csv (external_staff_id → internal_user_id).',
    '2. Exportá branches y armá branch_map.csv (external_branch_id → internal_branch_id),',
    '   o usá UUIDs internos como external_* (aceptados si existen en el tenant) — fase 40.',
    '3. Los CSV de clínica/export full incluyen external_branch_id y external_assigned_user_id',
    '   con UUIDs internos para re-import en el mismo tenant.',
    '4. Vacío en staff clínico/pagos/facturas → usuario importador; sin mapa → error.',
    '5. Agenda vacío → null. Nunca se crean usuarios auth ni se toca caja/planes.',
    '6. Vacío en sucursal → sede de sesión; sin mapa ni UUID conocido → error.',
    '7. Formato 1.6+: export JSON/ZIP de una sola entidad es enfocado (sin volcar',
    '   toda la clínica vacía); companions/specialty children van incluidos.',
    '8. Fase 50: el ZIP full_clinic / patient_clinical emite attachments_meta.csv para los',
    '   binarios empaquetados (re-import con mapa branch/staff por archivo — fase 42).',
    '',
  ].join('\n');
}

export function parseStaffMapCsv(csvText: string): {
  map: Record<string, string>;
  issues: Array<{ rowNumber: number; message: string }>;
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const map: Record<string, string> = {};
  const issues: Array<{ rowNumber: number; message: string }> = [];
  if (lines.length === 0) return { map, issues };
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const extIdx = header.findIndex((h) =>
    ['external_staff_id', 'staff_id', 'external_user_id', 'user_id', 'id_profesional'].includes(h)
  );
  const intIdx = header.findIndex((h) =>
    ['internal_user_id', 'profile_id', 'user_uuid', 'id_interno'].includes(h)
  );
  if (extIdx < 0 || intIdx < 0) {
    issues.push({ rowNumber: 1, message: 'Cabeceras requeridas: external_staff_id, internal_user_id' });
    return { map, issues };
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const externalId = cols[extIdx] ?? '';
    const internalId = cols[intIdx] ?? '';
    if (!externalId || !internalId) {
      issues.push({ rowNumber: i + 1, message: 'Fila incompleta' });
      continue;
    }
    map[externalId] = internalId;
  }
  return { map, issues };
}

export function pushUnmappedBranchIssue(
  issues: Array<{
    rowNumber: number;
    entityType: string;
    field?: string;
    code: string;
    message: string;
    severity: 'error' | 'warning';
    recommendedAction?: string;
    sourceReference?: string;
  }>,
  rowNumber: number,
  entityType: string,
  externalBranchId: string | null | undefined,
  knownBranchExternalIds?: Set<string>,
  knownBranchInternalIds?: Set<string>
): void {
  const ext = (externalBranchId ?? '').trim();
  if (!ext) return;
  if (knownBranchExternalIds?.has(ext)) return;
  if (knownBranchInternalIds?.has(ext)) return;
  issues.push({
    rowNumber,
    entityType,
    field: 'external_branch_id',
    code: 'unmapped_branch',
    message:
      'Sucursal externa no mapeada; cargá mapa branch (external_branch_id → internal_branch_id) o usá un branch id del tenant',
    severity: 'error',
    recommendedAction: 'Exportá branches y armá el mapa, o quitá external_branch_id',
    sourceReference: ext,
  });
}

export const BRANCH_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_branch_id',
    label: 'ID externo sucursal',
    required: true,
    aliases: ['external_branch_id', 'branch_id', 'id_sucursal', 'sucursal_id'],
  },
  {
    key: 'name',
    label: 'Nombre',
    required: true,
    aliases: ['name', 'nombre', 'sucursal', 'branch_name'],
  },
  {
    key: 'code',
    label: 'Código',
    required: true,
    aliases: ['code', 'codigo', 'código', 'sku_sucursal'],
  },
  {
    key: 'address',
    label: 'Dirección',
    aliases: ['address', 'direccion', 'dirección'],
  },
  {
    key: 'phone',
    label: 'Teléfono',
    aliases: ['phone', 'telefono', 'teléfono'],
  },
  {
    key: 'email',
    label: 'Email',
    aliases: ['email', 'correo'],
  },
  {
    key: 'timezone',
    label: 'Zona horaria',
    aliases: ['timezone', 'tz', 'zona_horaria'],
  },
  {
    key: 'is_active',
    label: 'Activa',
    aliases: ['is_active', 'activa', 'activo'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const OWNER_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_owner_id',
    label: 'ID externo propietario',
    required: true,
    aliases: ['external_owner_id', 'owner_id', 'id_externo', 'codigo', 'código'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'full_name',
    label: 'Nombre completo',
    required: true,
    aliases: ['full_name', 'nombre_completo', 'nombre', 'name', 'owner', 'propietario', 'tutor'],
  },
  {
    key: 'document_type',
    label: 'Tipo documento',
    aliases: ['document_type', 'tipo_documento', 'tipo_doc'],
  },
  {
    key: 'document_number',
    label: 'Número documento',
    aliases: ['document_number', 'documento', 'dni', 'cuit', 'doc'],
  },
  {
    key: 'phone',
    label: 'Teléfono',
    aliases: ['phone', 'telefono', 'teléfono', 'celular', 'mobile', 'tel'],
  },
  {
    key: 'email',
    label: 'Email',
    aliases: ['email', 'correo', 'mail', 'e-mail'],
  },
  {
    key: 'address',
    label: 'Dirección',
    aliases: ['address', 'direccion', 'dirección', 'domicilio'],
  },
  {
    key: 'city',
    label: 'Ciudad',
    aliases: ['city', 'ciudad', 'localidad'],
  },
  {
    key: 'province',
    label: 'Provincia',
    aliases: ['province', 'provincia'],
  },
  {
    key: 'postal_code',
    label: 'Código postal',
    aliases: ['postal_code', 'cp', 'codigo_postal', 'código_postal'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
];

export const PATIENT_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente', 'codigo_paciente'],
  },
  {
    key: 'external_owner_id',
    label: 'ID externo propietario',
    required: true,
    aliases: ['external_owner_id', 'owner_id', 'id_propietario', 'propietario_id'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'name',
    label: 'Nombre paciente',
    required: true,
    aliases: ['name', 'nombre', 'mascota', 'paciente', 'patient'],
  },
  {
    key: 'species',
    label: 'Especie',
    required: true,
    aliases: ['species', 'especie'],
  },
  {
    key: 'breed',
    label: 'Raza',
    aliases: ['breed', 'raza'],
  },
  {
    key: 'sex',
    label: 'Sexo',
    aliases: ['sex', 'sexo', 'genero', 'género'],
  },
  {
    key: 'birth_date',
    label: 'Fecha nacimiento',
    aliases: ['birth_date', 'fecha_nacimiento', 'nacimiento', 'dob'],
  },
  {
    key: 'microchip',
    label: 'Microchip',
    aliases: ['microchip', 'chip'],
  },
  {
    key: 'color',
    label: 'Color',
    aliases: ['color', 'pelaje'],
  },
  {
    key: 'weight_kg',
    label: 'Peso (kg)',
    aliases: ['weight', 'weight_kg', 'peso'],
  },
  {
    key: 'status',
    label: 'Estado',
    aliases: ['status', 'estado'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas'],
  },
];

export const CLINICAL_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_clinical_record_id',
    label: 'ID externo registro',
    required: true,
    aliases: ['external_clinical_record_id', 'clinical_id', 'record_id', 'id_historia'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
  {
    key: 'original_date',
    label: 'Fecha original',
    required: true,
    aliases: ['original_date', 'entry_date', 'fecha', 'fecha_original', 'date'],
  },
  {
    key: 'original_veterinarian',
    label: 'Profesional original',
    aliases: ['original_veterinarian', 'veterinario', 'profesional', 'doctor'],
  },
  {
    key: 'record_type',
    label: 'Tipo de registro',
    aliases: ['record_type', 'entry_type', 'tipo', 'tipo_registro'],
  },
  {
    key: 'reason',
    label: 'Motivo / título',
    aliases: ['reason', 'title', 'motivo', 'titulo', 'título'],
  },
  {
    key: 'anamnesis',
    label: 'Anamnesis',
    aliases: ['anamnesis', 'anamnese', 'historia'],
  },
  {
    key: 'clinical_findings',
    label: 'Examen clínico',
    aliases: ['clinical_findings', 'physical_exam', 'examen', 'hallazgos'],
  },
  {
    key: 'diagnosis',
    label: 'Diagnóstico',
    aliases: ['diagnosis', 'diagnostico', 'diagnóstico'],
  },
  {
    key: 'treatment',
    label: 'Tratamiento',
    aliases: ['treatment', 'tratamiento'],
  },
  {
    key: 'observations',
    label: 'Observaciones / plan',
    aliases: ['observations', 'plan', 'observaciones', 'notas'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const VACCINATION_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_vaccination_id',
    label: 'ID externo vacunación',
    required: true,
    aliases: ['external_vaccination_id', 'vaccination_id', 'id_vacuna', 'id_vacunacion'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
  {
    key: 'vaccine_name',
    label: 'Vacuna',
    required: true,
    aliases: ['vaccine_name', 'vacuna', 'nombre_vacuna'],
  },
  {
    key: 'administered_at',
    label: 'Fecha aplicación',
    required: true,
    aliases: ['administered_at', 'fecha', 'fecha_aplicacion', 'application_date'],
  },
  {
    key: 'next_due_at',
    label: 'Próxima dosis',
    aliases: ['next_due_at', 'proxima', 'próxima', 'next_due'],
  },
  {
    key: 'manufacturer',
    label: 'Laboratorio',
    aliases: ['manufacturer', 'laboratorio', 'fabricante'],
  },
  {
    key: 'lot_number',
    label: 'Lote',
    aliases: ['lot_number', 'lote', 'lot'],
  },
  {
    key: 'original_veterinarian',
    label: 'Profesional original',
    aliases: ['original_veterinarian', 'veterinario', 'profesional'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const LAB_ORDER_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_lab_order_id',
    label: 'ID externo lab',
    required: true,
    aliases: ['external_lab_order_id', 'lab_order_id', 'id_lab', 'id_laboratorio'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
  {
    key: 'ordered_at',
    label: 'Fecha solicitud',
    required: true,
    aliases: ['ordered_at', 'fecha', 'fecha_solicitud', 'order_date'],
  },
  {
    key: 'title',
    label: 'Título / estudio',
    required: true,
    aliases: ['title', 'estudio', 'titulo', 'título', 'test'],
  },
  {
    key: 'tests',
    label: 'Tests (separados por |)',
    aliases: ['tests', 'items', 'analisis', 'análisis'],
  },
  {
    key: 'priority',
    label: 'Prioridad',
    aliases: ['priority', 'prioridad'],
  },
  {
    key: 'sample_type',
    label: 'Tipo de muestra',
    aliases: ['sample_type', 'muestra', 'tipo_muestra'],
  },
  {
    key: 'interpretation',
    label: 'Interpretación',
    aliases: ['interpretation', 'interpretacion', 'interpretación', 'resultado'],
  },
  {
    key: 'original_veterinarian',
    label: 'Profesional original',
    aliases: ['original_veterinarian', 'veterinario', 'profesional'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const SURGERY_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_surgery_id',
    label: 'ID externo cirugía',
    required: true,
    aliases: ['external_surgery_id', 'surgery_id', 'id_cirugia', 'id_cirugía'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'external_assigned_user_id',
    label: 'ID externo profesional',
    aliases: [
      'external_assigned_user_id',
      'assigned_user_id',
      'veterinarian_id',
      'id_profesional',
      'profesional',
      'vet_id',
    ],
  },
  {
    key: 'scheduled_at',
    label: 'Fecha cirugía',
    required: true,
    aliases: ['scheduled_at', 'fecha', 'surgery_date', 'fecha_cirugia'],
  },
  {
    key: 'procedure_name',
    label: 'Procedimiento',
    required: true,
    aliases: ['procedure_name', 'procedimiento', 'cirugia', 'cirugía', 'surgery'],
  },
  {
    key: 'diagnosis',
    label: 'Diagnóstico',
    aliases: ['diagnosis', 'diagnostico', 'diagnóstico'],
  },
  {
    key: 'anesthesia',
    label: 'Anestesia',
    aliases: ['anesthesia', 'anestesia'],
  },
  {
    key: 'asa',
    label: 'ASA',
    aliases: ['asa'],
  },
  {
    key: 'original_veterinarian',
    label: 'Cirujano original',
    aliases: ['original_veterinarian', 'cirujano', 'surgeon', 'veterinario'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'postop', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const PRESCRIPTION_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_prescription_id',
    label: 'ID externo receta',
    required: true,
    aliases: ['external_prescription_id', 'prescription_id', 'id_receta'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
  {
    key: 'prescribed_at',
    label: 'Fecha prescrita',
    required: true,
    aliases: ['prescribed_at', 'fecha', 'prescription_date', 'fecha_receta'],
  },
  {
    key: 'medication_name',
    label: 'Medicamento',
    required: true,
    aliases: ['medication_name', 'medicamento', 'drug', 'farmaco', 'fármaco'],
  },
  {
    key: 'dose',
    label: 'Dosis',
    required: true,
    aliases: ['dose', 'dosis'],
  },
  {
    key: 'frequency',
    label: 'Frecuencia',
    required: true,
    aliases: ['frequency', 'frecuencia'],
  },
  {
    key: 'duration',
    label: 'Duración',
    aliases: ['duration', 'duracion', 'duración'],
  },
  {
    key: 'route',
    label: 'Vía',
    aliases: ['route', 'via', 'vía'],
  },
  {
    key: 'quantity',
    label: 'Cantidad',
    aliases: ['quantity', 'cantidad'],
  },
  {
    key: 'instructions',
    label: 'Indicaciones',
    aliases: ['instructions', 'indicaciones', 'posologia', 'posología'],
  },
  {
    key: 'original_veterinarian',
    label: 'Profesional original',
    aliases: ['original_veterinarian', 'veterinario', 'profesional'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const HOSPITALIZATION_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_hospitalization_id',
    label: 'ID externo internación',
    required: true,
    aliases: ['external_hospitalization_id', 'hospitalization_id', 'id_internacion', 'id_internación'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'external_assigned_user_id',
    label: 'ID externo profesional',
    aliases: [
      'external_assigned_user_id',
      'assigned_user_id',
      'veterinarian_id',
      'id_profesional',
      'profesional',
      'vet_id',
    ],
  },
  {
    key: 'admitted_at',
    label: 'Fecha ingreso',
    required: true,
    aliases: ['admitted_at', 'fecha_ingreso', 'ingreso', 'admission_date'],
  },
  {
    key: 'discharged_at',
    label: 'Fecha alta',
    aliases: ['discharged_at', 'fecha_alta', 'alta', 'discharge_date'],
  },
  {
    key: 'reason',
    label: 'Motivo',
    required: true,
    aliases: ['reason', 'motivo', 'reason_for_admission'],
  },
  {
    key: 'diagnosis',
    label: 'Diagnóstico',
    aliases: ['diagnosis', 'diagnostico', 'diagnóstico'],
  },
  {
    key: 'treatment_plan',
    label: 'Plan de tratamiento',
    aliases: ['treatment_plan', 'tratamiento', 'plan'],
  },
  {
    key: 'cage',
    label: 'Jaula / box',
    aliases: ['cage', 'jaula', 'box'],
  },
  {
    key: 'status',
    label: 'Estado',
    aliases: ['status', 'estado'],
  },
  {
    key: 'original_veterinarian',
    label: 'Profesional original',
    aliases: ['original_veterinarian', 'veterinario', 'profesional'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const APPOINTMENT_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_appointment_id',
    label: 'ID externo cita',
    required: true,
    aliases: ['external_appointment_id', 'appointment_id', 'id_cita', 'id_turno'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'external_assigned_user_id',
    label: 'ID externo profesional asignado',
    aliases: [
      'external_assigned_user_id',
      'assigned_user_id',
      'veterinarian_id',
      'id_profesional',
      'profesional',
      'vet_id',
    ],
  },
  {
    key: 'starts_at',
    label: 'Inicio',
    required: true,
    aliases: ['starts_at', 'inicio', 'fecha_hora', 'start', 'fecha'],
  },
  {
    key: 'ends_at',
    label: 'Fin',
    aliases: ['ends_at', 'fin', 'end', 'hasta'],
  },
  {
    key: 'appointment_type',
    label: 'Tipo',
    aliases: ['appointment_type', 'tipo', 'type'],
  },
  {
    key: 'status',
    label: 'Estado',
    aliases: ['status', 'estado'],
  },
  {
    key: 'title',
    label: 'Título',
    aliases: ['title', 'titulo', 'título', 'asunto'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const INVENTORY_PRODUCT_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_product_id',
    label: 'ID externo producto',
    required: true,
    aliases: ['external_product_id', 'product_id', 'id_producto', 'sku_externo'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'name',
    label: 'Nombre',
    required: true,
    aliases: ['name', 'nombre', 'producto', 'product_name'],
  },
  {
    key: 'sku',
    label: 'SKU',
    aliases: ['sku', 'codigo', 'código', 'code'],
  },
  {
    key: 'category',
    label: 'Categoría',
    aliases: ['category', 'categoria', 'categoría', 'tipo'],
  },
  {
    key: 'unit',
    label: 'Unidad',
    aliases: ['unit', 'unidad', 'uom'],
  },
  {
    key: 'quantity',
    label: 'Cantidad',
    aliases: ['quantity', 'cantidad', 'stock', 'qty'],
  },
  {
    key: 'min_quantity',
    label: 'Stock mínimo',
    aliases: ['min_quantity', 'stock_minimo', 'stock_mínimo', 'min'],
  },
  {
    key: 'unit_cost',
    label: 'Costo unitario',
    aliases: ['unit_cost', 'costo', 'cost'],
  },
  {
    key: 'unit_price',
    label: 'Precio unitario',
    aliases: ['unit_price', 'precio', 'price'],
  },
  {
    key: 'manufacturer',
    label: 'Fabricante',
    aliases: ['manufacturer', 'fabricante', 'laboratorio', 'marca'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const INVOICE_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_invoice_id',
    label: 'ID externo factura',
    required: true,
    aliases: ['external_invoice_id', 'invoice_id', 'id_factura', 'factura'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
  {
    key: 'external_owner_id',
    label: 'ID externo propietario',
    aliases: ['external_owner_id', 'owner_id', 'id_propietario', 'id_tutor'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  {
    key: 'number',
    label: 'Número',
    aliases: ['number', 'numero', 'número', 'invoice_number'],
  },
  {
    key: 'status',
    label: 'Estado',
    aliases: ['status', 'estado'],
  },
  {
    key: 'issued_at',
    label: 'Fecha emisión',
    aliases: ['issued_at', 'fecha', 'emision', 'emisión', 'fecha_emision'],
  },
  {
    key: 'currency',
    label: 'Moneda',
    aliases: ['currency', 'moneda'],
  },
  {
    key: 'subtotal',
    label: 'Subtotal',
    aliases: ['subtotal'],
  },
  {
    key: 'tax_amount',
    label: 'Impuestos',
    aliases: ['tax_amount', 'impuestos', 'iva'],
  },
  {
    key: 'total',
    label: 'Total',
    aliases: ['total', 'importe'],
  },
  {
    key: 'paid_amount',
    label: 'Pagado',
    aliases: ['paid_amount', 'pagado', 'abonado'],
  },
  {
    key: 'balance',
    label: 'Saldo',
    aliases: ['balance', 'saldo', 'pendiente'],
  },
  {
    key: 'description',
    label: 'Descripción ítem',
    aliases: ['description', 'descripcion', 'descripción', 'concepto', 'item'],
  },
  {
    key: 'quantity',
    label: 'Cantidad ítem',
    aliases: ['quantity', 'cantidad', 'qty'],
  },
  {
    key: 'unit_price',
    label: 'Precio unitario',
    aliases: ['unit_price', 'precio', 'precio_unitario'],
  },
  {
    key: 'line_total',
    label: 'Total línea',
    aliases: ['line_total', 'total_linea', 'total_línea', 'importe_linea'],
  },
  {
    key: 'external_product_id',
    label: 'ID externo producto',
    aliases: ['external_product_id', 'product_id', 'id_producto', 'sku_externo'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const PAYMENT_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_payment_id',
    label: 'ID externo pago',
    required: true,
    aliases: ['external_payment_id', 'payment_id', 'id_pago'],
  },
  {
    key: 'external_invoice_id',
    label: 'ID externo factura',
    required: true,
    aliases: ['external_invoice_id', 'invoice_id', 'id_factura', 'factura'],
  },
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
  {
    key: 'amount',
    label: 'Monto',
    required: true,
    aliases: ['amount', 'monto', 'importe', 'pago'],
  },
  {
    key: 'method',
    label: 'Método',
    aliases: ['method', 'metodo', 'método', 'forma_pago', 'medio'],
  },
  {
    key: 'paid_at',
    label: 'Fecha de pago',
    aliases: ['paid_at', 'fecha', 'fecha_pago', 'pago_at'],
  },
  {
    key: 'reference',
    label: 'Referencia',
    aliases: ['reference', 'referencia', 'comprobante', 'tx'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export const CONSULTATION_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_consultation_id',
    label: 'ID externo consulta',
    required: true,
    aliases: ['external_consultation_id', 'consultation_id', 'id_consulta'],
  },
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  {
    key: 'external_assigned_user_id',
    label: 'ID externo profesional',
    aliases: [
      'external_assigned_user_id',
      'assigned_user_id',
      'veterinarian_id',
      'id_profesional',
      'profesional',
      'vet_id',
    ],
  },
  {
    key: 'external_appointment_id',
    label: 'ID externo cita',
    aliases: ['external_appointment_id', 'appointment_id', 'id_cita', 'id_turno'],
  },
  {
    key: 'started_at',
    label: 'Inicio',
    required: true,
    aliases: ['started_at', 'inicio', 'fecha_hora', 'fecha'],
  },
  {
    key: 'completed_at',
    label: 'Fin',
    aliases: ['completed_at', 'fin', 'cierre'],
  },
  {
    key: 'status',
    label: 'Estado',
    aliases: ['status', 'estado'],
  },
  {
    key: 'title',
    label: 'Título',
    aliases: ['title', 'titulo', 'título', 'motivo'],
  },
  {
    key: 'anamnesis',
    label: 'Anamnesis',
    aliases: ['anamnesis', 'historia'],
  },
  {
    key: 'physical_exam',
    label: 'Examen físico',
    aliases: ['physical_exam', 'examen', 'examen_fisico', 'examen_físico'],
  },
  {
    key: 'diagnosis',
    label: 'Diagnóstico',
    aliases: ['diagnosis', 'diagnostico', 'diagnóstico'],
  },
  {
    key: 'treatment',
    label: 'Tratamiento',
    aliases: ['treatment', 'tratamiento'],
  },
  {
    key: 'plan',
    label: 'Plan',
    aliases: ['plan', 'plan_seguimiento'],
  },
  {
    key: 'weight_kg',
    label: 'Peso (kg)',
    aliases: ['weight_kg', 'peso', 'weight'],
  },
  {
    key: 'temperature_c',
    label: 'Temperatura (°C)',
    aliases: ['temperature_c', 'temperatura', 'temp'],
  },
  {
    key: 'notes',
    label: 'Notas',
    aliases: ['notes', 'notas', 'observaciones'],
  },
  {
    key: 'source_system',
    label: 'Sistema origen',
    aliases: ['source_system', 'sistema', 'origen'],
  },
];

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_');
}

export function autoMapColumns(
  headers: string[],
  fields: ImportFieldDef[]
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const used = new Set<string>();
  for (const field of fields) {
    const aliasSet = new Set(field.aliases.map(normalizeHeader));
    const match = headers.find((header) => {
      const normalized = normalizeHeader(header);
      return aliasSet.has(normalized) && !used.has(header);
    });
    mapping[field.key] = match ?? null;
    if (match) used.add(match);
  }
  return mapping;
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]!).map((h) => h.replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').replace(/^"|"$/g, '');
    });
    return row;
  });
  return { headers, rows };
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export type ParsedDate =
  | { ok: true; isoDate: string }
  | { ok: false; reason: 'empty' | 'ambiguous' | 'invalid' };

export function parseImportDate(raw: string | null | undefined, locale: DateLocale): ParsedDate {
  const value = (raw ?? '').trim();
  if (!value) return { ok: false, reason: 'empty' };

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: 'invalid' };
    return { ok: true, isoDate: value };
  }

  const slash = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    if (locale === 'iso') return { ok: false, reason: 'invalid' };
    if (locale === 'en-US') {
      if (a > 12) return { ok: false, reason: 'invalid' };
      const iso = `${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
      return { ok: true, isoDate: iso };
    }
    // es-AR: DD/MM/YYYY — if both <= 12 and different, still use locale (not silent guess flip)
    if (b > 12) return { ok: false, reason: 'invalid' };
    if (a > 31) return { ok: false, reason: 'invalid' };
    const iso = `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: 'invalid' };
    return { ok: true, isoDate: iso };
  }

  return { ok: false, reason: 'invalid' };
}

export type ParsedDateTime =
  | { ok: true; iso: string }
  | { ok: false; reason: 'empty' | 'invalid' };

/** Accepts ISO datetime, `YYYY-MM-DD HH:mm`, `DD/MM/YYYY HH:mm`, or date-only (noon UTC). */
export function parseImportDateTime(
  raw: string | null | undefined,
  locale: DateLocale
): ParsedDateTime {
  const value = (raw ?? '').trim();
  if (!value) return { ok: false, reason: 'empty' };

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: 'invalid' };
    return { ok: true, iso: d.toISOString() };
  }

  const withTime = value.match(
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (withTime) {
    const datePart = parseImportDate(withTime[1], locale);
    if (!datePart.ok) return { ok: false, reason: 'invalid' };
    const hh = Number(withTime[2]);
    const mm = Number(withTime[3]);
    const ss = Number(withTime[4] ?? 0);
    if (hh > 23 || mm > 59 || ss > 59) return { ok: false, reason: 'invalid' };
    const iso = `${datePart.isoDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: 'invalid' };
    return { ok: true, iso: d.toISOString() };
  }

  const dateOnly = parseImportDate(value, locale);
  if (!dateOnly.ok) return { ok: false, reason: 'invalid' };
  return { ok: true, iso: `${dateOnly.isoDate}T12:00:00.000Z` };
}

export function isValidEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeDocument(value: string): string {
  return value.replace(/[.\-\s]/g, '').toUpperCase();
}

export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '');
}

export type ValidationIssue = {
  rowNumber: number;
  entityType: string;
  field?: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  recommendedAction?: string;
  sourceReference?: string;
  /** Existing SyncVete row to link when decision=link */
  matchInternalId?: string;
};

export type RowConflictDecision = {
  rowNumber: number;
  decision: ConflictPolicy;
  linkInternalId?: string | null;
  externalId?: string | null;
};

export type OwnerImportRow = {
  rowNumber: number;
  externalOwnerId: string;
  externalBranchId: string | null;
  fullName: string;
  documentType: string | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  notes: string | null;
};

export type PatientImportRow = {
  rowNumber: number;
  externalPatientId: string;
  externalOwnerId: string;
  externalBranchId: string | null;
  name: string;
  species: string;
  breed: string | null;
  sex: string;
  birthDate: string | null;
  microchip: string | null;
  color: string | null;
  weightKg: number | null;
  status: string | null;
  notes: string | null;
};

export type ClinicalImportRow = {
  rowNumber: number;
  externalClinicalId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  originalDate: string;
  originalVeterinarian: string | null;
  recordType: string;
  reason: string | null;
  anamnesis: string | null;
  clinicalFindings: string | null;
  diagnosis: string | null;
  treatment: string | null;
  observations: string | null;
  sourceSystem: string | null;
};

export function mapRow(
  raw: Record<string, string>,
  mapping: Record<string, string | null>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, source] of Object.entries(mapping)) {
    out[field] = source ? (raw[source] ?? '').trim() : '';
  }
  return out;
}

export function validateOwnerRows(
  rows: OwnerImportRow[],
  options?: {
    existingDocuments?: Set<string>;
    existingEmails?: Set<string>;
    documentToId?: Map<string, string>;
    emailToId?: Map<string, string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenExternal = new Set<string>();
  for (const row of rows) {
    if (!row.externalOwnerId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'owners',
        field: 'external_owner_id',
        code: 'required',
        message: 'Falta ID externo de propietario',
        severity: 'error',
        recommendedAction: 'Completar external_owner_id',
      });
    } else if (seenExternal.has(row.externalOwnerId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'owners',
        field: 'external_owner_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
        sourceReference: row.externalOwnerId,
      });
    } else {
      seenExternal.add(row.externalOwnerId);
    }

    if (!row.fullName) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'owners',
        field: 'full_name',
        code: 'required',
        message: 'Falta nombre completo',
        severity: 'error',
      });
    }
    if (row.email && !isValidEmail(row.email)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'owners',
        field: 'email',
        code: 'invalid_email',
        message: 'Email inválido',
        severity: 'error',
        recommendedAction: 'Corregir formato de email',
      });
    }
    if (row.documentNumber && options?.existingDocuments?.has(normalizeDocument(row.documentNumber))) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'owners',
        field: 'document_number',
        code: 'possible_duplicate',
        message: 'Posible duplicado por documento',
        severity: 'warning',
        recommendedAction: 'Elegir vincular o crear nuevo',
        sourceReference: row.documentNumber,
        matchInternalId: options.documentToId?.get(normalizeDocument(row.documentNumber)),
      });
    }
    if (row.email && options?.existingEmails?.has(row.email.toLowerCase())) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'owners',
        field: 'email',
        code: 'possible_duplicate',
        message: 'Posible duplicado por email',
        severity: 'warning',
        recommendedAction: 'Elegir vincular o crear nuevo',
        matchInternalId: options.emailToId?.get(row.email.toLowerCase()),
      });
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'owners',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
  }
  return issues;
}

export function validatePatientRows(
  rows: PatientImportRow[],
  options?: {
    knownOwnerExternalIds?: Set<string>;
    existingMicrochips?: Set<string>;
    microchipToId?: Map<string, string>;
    locale?: DateLocale;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const locale = options?.locale ?? 'es-AR';
  for (const row of rows) {
    if (!row.externalPatientId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'external_patient_id',
        code: 'required',
        message: 'Falta ID externo de paciente',
        severity: 'error',
      });
    } else if (seen.has(row.externalPatientId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'external_patient_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalPatientId);
    }
    if (!row.externalOwnerId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'external_owner_id',
        code: 'required',
        message: 'Falta ID externo de propietario',
        severity: 'error',
      });
    } else if (
      options?.knownOwnerExternalIds &&
      !options.knownOwnerExternalIds.has(row.externalOwnerId)
    ) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'external_owner_id',
        code: 'missing_owner',
        message: 'No se encontró el propietario referenciado',
        severity: 'error',
        recommendedAction: 'Importar propietarios primero o corregir ID',
        sourceReference: row.externalOwnerId,
      });
    }
    if (!row.name) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'name',
        code: 'required',
        message: 'Falta nombre del paciente',
        severity: 'error',
      });
    }
    if (!row.species) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'species',
        code: 'required',
        message: 'Falta especie',
        severity: 'error',
      });
    }
    if (row.birthDate) {
      const parsed = parseImportDate(row.birthDate, locale);
      if (!parsed.ok) {
        issues.push({
          rowNumber: row.rowNumber,
          entityType: 'patients',
          field: 'birth_date',
          code: 'invalid_date',
          message: 'Fecha de nacimiento inválida',
          severity: 'error',
          recommendedAction: 'Usar YYYY-MM-DD o el locale elegido',
        });
      }
    }
    if (row.microchip && options?.existingMicrochips?.has(row.microchip)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'patients',
        field: 'microchip',
        code: 'possible_duplicate',
        message: 'Posible duplicado por microchip',
        severity: 'warning',
        recommendedAction: 'Vincular a paciente existente o revisar',
        matchInternalId: options.microchipToId?.get(row.microchip),
      });
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'patients',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
  }
  return issues;
}

export function validateClinicalRows(
  rows: ClinicalImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  for (const row of rows) {
    if (!row.externalClinicalId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'clinical_entries',
        field: 'external_clinical_record_id',
        code: 'required',
        message: 'Falta ID externo del registro clínico',
        severity: 'error',
      });
    }
    if (!row.externalPatientId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'clinical_entries',
        field: 'external_patient_id',
        code: 'required',
        message: 'Falta ID externo del paciente',
        severity: 'error',
      });
    } else if (
      options?.knownPatientExternalIds &&
      !options.knownPatientExternalIds.has(row.externalPatientId)
    ) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'clinical_entries',
        field: 'external_patient_id',
        code: 'missing_patient',
        message: 'No se encontró el paciente referenciado',
        severity: 'error',
        recommendedAction: 'Importar pacientes primero',
        sourceReference: row.externalPatientId,
      });
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'clinical_entries',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'clinical_entries',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    const parsed = parseImportDate(row.originalDate, locale);
    if (!parsed.ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'clinical_entries',
        field: 'original_date',
        code: 'invalid_date',
        message: 'Fecha original inválida o ambigua',
        severity: 'error',
        recommendedAction: 'Confirmar locale o usar YYYY-MM-DD',
      });
    }
  }
  return issues;
}

export type BranchImportRow = {
  rowNumber: number;
  externalBranchId: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  isActive: string | null;
  sourceSystem: string | null;
};

export function validateBranchRows(rows: BranchImportRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenId = new Set<string>();
  const seenCode = new Set<string>();
  for (const row of rows) {
    if (!row.externalBranchId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'branches',
        field: 'external_branch_id',
        code: 'required',
        message: 'Falta ID externo de sucursal',
        severity: 'error',
      });
    } else if (seenId.has(row.externalBranchId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'branches',
        field: 'external_branch_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seenId.add(row.externalBranchId);
    }
    if (!row.name || row.name.trim().length < 2) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'branches',
        field: 'name',
        code: 'required',
        message: 'Falta nombre de sucursal',
        severity: 'error',
      });
    }
    const code = (row.code ?? '').trim().toUpperCase();
    if (!code) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'branches',
        field: 'code',
        code: 'required',
        message: 'Falta código de sucursal',
        severity: 'error',
      });
    } else if (seenCode.has(code)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'branches',
        field: 'code',
        code: 'duplicate_in_file',
        message: 'Código duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seenCode.add(code);
    }
  }
  return issues;
}

export function buildBranchTemplateCsv(): string {
  return toCsv(BRANCH_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_branch_id: 'BR-001',
      name: 'Sede Centro',
      code: 'CENTRO',
      address: 'Av. Principal 100',
      phone: '1140000000',
      email: 'centro@clinica.example',
      timezone: 'America/Argentina/Buenos_Aires',
      is_active: 'true',
      source_system: 'legacy',
    },
  ]);
}

export function buildOwnerTemplateCsv(): string {
  return toCsv(
    OWNER_IMPORT_FIELDS.map((f) => f.key),
    [
      {
        external_owner_id: 'OWN-001',
        external_branch_id: 'BR-001',
        full_name: 'Juan Perez',
        document_type: 'DNI',
        document_number: '30111222',
        phone: '1155555555',
        email: 'juan@email.com',
        address: 'Av. Cordoba 1234',
        city: 'Buenos Aires',
        province: 'CABA',
        postal_code: '1414',
        notes: 'Ejemplo',
      },
    ]
  );
}

export function buildPatientTemplateCsv(): string {
  return toCsv(
    PATIENT_IMPORT_FIELDS.map((f) => f.key),
    [
      {
        external_patient_id: 'PAT-001',
        external_owner_id: 'OWN-001',
        external_branch_id: 'BR-001',
        name: 'Rocky',
        species: 'Canino',
        breed: 'Labrador',
        sex: 'Macho',
        birth_date: '2020-03-12',
        microchip: '985141000123',
        color: 'Golden',
        weight_kg: '31.5',
        status: 'active',
        notes: '',
      },
    ]
  );
}

export function buildClinicalTemplateCsv(): string {
  return toCsv(
    CLINICAL_IMPORT_FIELDS.map((f) => f.key),
    [
      {
        external_clinical_record_id: 'CLI-001',
        external_patient_id: 'PAT-001',
        external_branch_id: 'BR-001',
        external_assigned_user_id: 'VET-LEGACY-01',
        original_date: '2024-05-14',
        original_veterinarian: 'Dr. Juan Lopez',
        record_type: 'consulta',
        reason: 'Control anual',
        anamnesis: 'Sin novedades',
        clinical_findings: 'Buen estado general',
        diagnosis: 'Saludable',
        treatment: 'Ninguno',
        observations: 'Volver en 12 meses',
        source_system: 'VetLegacy',
      },
    ]
  );
}

export type VaccinationImportRow = {
  rowNumber: number;
  externalVaccinationId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  vaccineName: string;
  administeredAt: string;
  nextDueAt: string | null;
  manufacturer: string | null;
  lotNumber: string | null;
  originalVeterinarian: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validateVaccinationRows(
  rows: VaccinationImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalVaccinationId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'vaccinations',
        field: 'external_vaccination_id',
        code: 'required',
        message: 'Falta ID externo de vacunación',
        severity: 'error',
      });
    } else if (seen.has(row.externalVaccinationId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'vaccinations',
        field: 'external_vaccination_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalVaccinationId);
    }
    if (!row.externalPatientId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'vaccinations',
        field: 'external_patient_id',
        code: 'required',
        message: 'Falta ID externo del paciente',
        severity: 'error',
      });
    } else if (
      options?.knownPatientExternalIds &&
      !options.knownPatientExternalIds.has(row.externalPatientId)
    ) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'vaccinations',
        field: 'external_patient_id',
        code: 'missing_patient',
        message: 'No se encontró el paciente referenciado',
        severity: 'error',
        recommendedAction: 'Importar pacientes primero',
        sourceReference: row.externalPatientId,
      });
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'vaccinations',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'vaccinations',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    if (!row.vaccineName || row.vaccineName.trim().length < 2) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'vaccinations',
        field: 'vaccine_name',
        code: 'required',
        message: 'Falta nombre de vacuna',
        severity: 'error',
      });
    }
    const administered = parseImportDate(row.administeredAt, locale);
    if (!administered.ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'vaccinations',
        field: 'administered_at',
        code: 'invalid_date',
        message: 'Fecha de aplicación inválida',
        severity: 'error',
      });
    }
    if (row.nextDueAt) {
      const next = parseImportDate(row.nextDueAt, locale);
      if (!next.ok) {
        issues.push({
          rowNumber: row.rowNumber,
          entityType: 'vaccinations',
          field: 'next_due_at',
          code: 'invalid_date',
          message: 'Fecha de próxima dosis inválida',
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

export function buildVaccinationTemplateCsv(): string {
  return toCsv(
    VACCINATION_IMPORT_FIELDS.map((f) => f.key),
    [
      {
        external_vaccination_id: 'VAC-001',
        external_patient_id: 'PAT-001',
        external_branch_id: 'BR-001',
        external_assigned_user_id: 'VET-LEGACY-01',
        vaccine_name: 'Antirrábica',
        administered_at: '2024-03-01',
        next_due_at: '2025-03-01',
        manufacturer: 'ExampleLab',
        lot_number: 'L-123',
        original_veterinarian: 'Dra. Garcia',
        notes: '',
        source_system: 'VetLegacy',
      },
    ]
  );
}

export type MigrationZipManifest = {
  format: string;
  version: string;
  createdAt?: string;
  sourceSystem?: string;
  entities?: Record<string, number>;
};

export function parseMigrationManifest(raw: unknown): MigrationZipManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.format !== DATA_MIGRATION_FORMAT) return null;
  if (typeof obj.version !== 'string') return null;
  return {
    format: String(obj.format),
    version: String(obj.version),
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
    sourceSystem: typeof obj.sourceSystem === 'string' ? obj.sourceSystem : undefined,
    entities:
      obj.entities && typeof obj.entities === 'object' && !Array.isArray(obj.entities)
        ? Object.fromEntries(
            Object.entries(obj.entities as Record<string, unknown>).map(([k, v]) => [
              k,
              Number(v) || 0,
            ])
          )
        : undefined,
  };
}

export function buildSampleMigrationManifest(sourceSystem = 'VetLegacy'): MigrationZipManifest {
  return {
    format: DATA_MIGRATION_FORMAT,
    version: DATA_MIGRATION_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    sourceSystem,
    entities: {
      branches: 1,
      owners: 1,
      patients: 1,
      clinicalRecords: 1,
      vaccinations: 1,
      labOrders: 1,
      surgeries: 1,
      prescriptions: 1,
      hospitalizations: 1,
      appointments: 1,
      consultations: 1,
      inventoryProducts: 1,
      invoices: 1,
      payments: 1,
    },
  };
}

export type LabOrderImportRow = {
  rowNumber: number;
  externalLabOrderId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  orderedAt: string;
  title: string;
  tests: string | null;
  priority: string | null;
  sampleType: string | null;
  interpretation: string | null;
  originalVeterinarian: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export type SurgeryImportRow = {
  rowNumber: number;
  externalSurgeryId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  scheduledAt: string;
  procedureName: string;
  diagnosis: string | null;
  anesthesia: string | null;
  asa: string | null;
  originalVeterinarian: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export type PrescriptionImportRow = {
  rowNumber: number;
  externalPrescriptionId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  prescribedAt: string;
  medicationName: string;
  dose: string;
  frequency: string;
  duration: string | null;
  route: string | null;
  quantity: string | null;
  instructions: string | null;
  originalVeterinarian: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

function pushMissingPatient(
  issues: ValidationIssue[],
  rowNumber: number,
  entityType: string,
  externalPatientId: string,
  known?: Set<string>
) {
  if (!externalPatientId) {
    issues.push({
      rowNumber,
      entityType,
      field: 'external_patient_id',
      code: 'required',
      message: 'Falta ID externo del paciente',
      severity: 'error',
    });
    return;
  }
  if (known && !known.has(externalPatientId)) {
    issues.push({
      rowNumber,
      entityType,
      field: 'external_patient_id',
      code: 'missing_patient',
      message: 'No se encontró el paciente referenciado',
      severity: 'error',
      recommendedAction: 'Importar pacientes primero',
      sourceReference: externalPatientId,
    });
  }
}

export function validateLabOrderRows(
  rows: LabOrderImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalLabOrderId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'lab_orders',
        field: 'external_lab_order_id',
        code: 'required',
        message: 'Falta ID externo de laboratorio',
        severity: 'error',
      });
    } else if (seen.has(row.externalLabOrderId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'lab_orders',
        field: 'external_lab_order_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalLabOrderId);
    }
    pushMissingPatient(
      issues,
      row.rowNumber,
      'lab_orders',
      row.externalPatientId,
      options?.knownPatientExternalIds
    );
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'lab_orders',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'lab_orders',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    if (!row.title || row.title.trim().length < 2) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'lab_orders',
        field: 'title',
        code: 'required',
        message: 'Falta título del estudio',
        severity: 'error',
      });
    }
    if (!parseImportDate(row.orderedAt, locale).ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'lab_orders',
        field: 'ordered_at',
        code: 'invalid_date',
        message: 'Fecha de solicitud inválida',
        severity: 'error',
      });
    }
  }
  return issues;
}

export function validateSurgeryRows(
  rows: SurgeryImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalSurgeryId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'surgeries',
        field: 'external_surgery_id',
        code: 'required',
        message: 'Falta ID externo de cirugía',
        severity: 'error',
      });
    } else if (seen.has(row.externalSurgeryId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'surgeries',
        field: 'external_surgery_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalSurgeryId);
    }
    pushMissingPatient(
      issues,
      row.rowNumber,
      'surgeries',
      row.externalPatientId,
      options?.knownPatientExternalIds
    );
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'surgeries',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'surgeries',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    if (!row.procedureName || row.procedureName.trim().length < 2) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'surgeries',
        field: 'procedure_name',
        code: 'required',
        message: 'Falta nombre del procedimiento',
        severity: 'error',
      });
    }
    if (!parseImportDate(row.scheduledAt, locale).ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'surgeries',
        field: 'scheduled_at',
        code: 'invalid_date',
        message: 'Fecha de cirugía inválida',
        severity: 'error',
      });
    }
  }
  return issues;
}

export function validatePrescriptionRows(
  rows: PrescriptionImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalPrescriptionId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'prescriptions',
        field: 'external_prescription_id',
        code: 'required',
        message: 'Falta ID externo de receta',
        severity: 'error',
      });
    } else if (seen.has(row.externalPrescriptionId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'prescriptions',
        field: 'external_prescription_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalPrescriptionId);
    }
    pushMissingPatient(
      issues,
      row.rowNumber,
      'prescriptions',
      row.externalPatientId,
      options?.knownPatientExternalIds
    );
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'prescriptions',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'prescriptions',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    if (!row.medicationName) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'prescriptions',
        field: 'medication_name',
        code: 'required',
        message: 'Falta medicamento',
        severity: 'error',
      });
    }
    if (!row.dose) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'prescriptions',
        field: 'dose',
        code: 'required',
        message: 'Falta dosis',
        severity: 'error',
      });
    }
    if (!row.frequency) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'prescriptions',
        field: 'frequency',
        code: 'required',
        message: 'Falta frecuencia',
        severity: 'error',
      });
    }
    if (!parseImportDate(row.prescribedAt, locale).ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'prescriptions',
        field: 'prescribed_at',
        code: 'invalid_date',
        message: 'Fecha de receta inválida',
        severity: 'error',
      });
    }
  }
  return issues;
}

export function buildLabOrderTemplateCsv(): string {
  return toCsv(LAB_ORDER_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_lab_order_id: 'LAB-001',
      external_patient_id: 'PAT-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      ordered_at: '2024-06-01',
      title: 'Hemograma',
      tests: 'Hemograma|Glucemia',
      priority: 'rutina',
      sample_type: 'sangre',
      interpretation: 'Dentro de parámetros',
      original_veterinarian: 'Dr. Lopez',
      notes: '',
      source_system: 'VetLegacy',
    },
  ]);
}

export function buildSurgeryTemplateCsv(): string {
  return toCsv(SURGERY_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_surgery_id: 'SUR-001',
      external_patient_id: 'PAT-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      scheduled_at: '2024-07-10',
      procedure_name: 'Ovariohisterectomía',
      diagnosis: 'Electiva',
      anesthesia: 'general',
      asa: 'I',
      original_veterinarian: 'Dra. Garcia',
      notes: 'Sin complicaciones',
      source_system: 'VetLegacy',
    },
  ]);
}

export function buildPrescriptionTemplateCsv(): string {
  return toCsv(PRESCRIPTION_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_prescription_id: 'RX-001',
      external_patient_id: 'PAT-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      prescribed_at: '2024-08-01',
      medication_name: 'Amoxicilina',
      dose: '250 mg',
      frequency: 'cada 12 h',
      duration: '7 días',
      route: 'oral',
      quantity: '14',
      instructions: 'Con comida',
      original_veterinarian: 'Dr. Lopez',
      notes: '',
      source_system: 'VetLegacy',
    },
  ]);
}

export function chunkRange(total: number, offset: number, chunkSize = DEFAULT_IMPORT_CHUNK_SIZE) {
  const safeOffset = Math.max(0, offset);
  const safeChunk = Math.min(500, Math.max(1, chunkSize));
  const end = Math.min(total, safeOffset + safeChunk);
  return {
    offset: safeOffset,
    end,
    size: Math.max(0, end - safeOffset),
    done: end >= total,
    nextOffset: end,
    total,
  };
}

export type MigrationAttachmentRef = {
  zipPath: string;
  externalPatientId: string;
  filename: string;
};

/** attachments/<externalPatientId>/<filename> */
export function parseMigrationAttachmentPath(zipPath: string): MigrationAttachmentRef | null {
  const normalized = zipPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const marker = 'attachments/';
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  const rest = normalized.slice(idx + marker.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const externalPatientId = parts[0]!;
  const filename = parts.slice(1).join('/');
  if (!externalPatientId || !filename || filename.toLowerCase() === 'readme.txt') return null;
  return { zipPath: normalized, externalPatientId, filename };
}

/** Phase 42: composite key joining attachments_meta.csv rows to zip attachment refs. */
export function buildAttachmentMetaKey(externalPatientId: string, filename: string): string {
  return `${externalPatientId.trim()}::${filename.trim()}`;
}

export type AttachmentMetaRow = {
  externalPatientId: string;
  filename: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
};

export const ATTACHMENT_META_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'external_patient_id',
    label: 'ID externo paciente',
    required: true,
    aliases: ['external_patient_id', 'patient_id', 'id_paciente'],
  },
  {
    key: 'filename',
    label: 'Nombre de archivo',
    required: true,
    aliases: ['filename', 'file_name', 'archivo', 'nombre_archivo'],
  },
  EXTERNAL_BRANCH_IMPORT_FIELD,
  EXTERNAL_ASSIGNED_USER_IMPORT_FIELD,
];

export function buildAttachmentMetaTemplateCsv(): string {
  return toCsv(ATTACHMENT_META_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_patient_id: 'PAT-001',
      filename: 'radiografia-torax.jpg',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
    },
  ]);
}

/** Phase 50: build attachments_meta.csv from exported attachment rows (round-trip with phase 42). */
export function buildAttachmentMetaExportCsv(
  rows: Array<{
    externalPatientId: string;
    filename: string;
    externalBranchId?: string | null;
    externalAssignedUserId?: string | null;
  }>
): string {
  return toCsv(
    ATTACHMENT_META_IMPORT_FIELDS.map((f) => f.key),
    rows.map((row) => ({
      external_patient_id: row.externalPatientId,
      filename: row.filename,
      external_branch_id: row.externalBranchId ?? '',
      external_assigned_user_id: row.externalAssignedUserId ?? '',
    }))
  );
}

/** Simple fixed-header parser, same pattern as staff_map / branch_map (no reordering, comma-split). */
export function parseAttachmentMetaCsv(csvText: string): {
  rows: AttachmentMetaRow[];
  issues: Array<{ rowNumber: number; message: string }>;
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: AttachmentMetaRow[] = [];
  const issues: Array<{ rowNumber: number; message: string }> = [];
  if (lines.length === 0) return { rows, issues };
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const patientIdx = header.findIndex((h) =>
    ['external_patient_id', 'patient_id', 'id_paciente'].includes(h)
  );
  const filenameIdx = header.findIndex((h) =>
    ['filename', 'file_name', 'archivo', 'nombre_archivo'].includes(h)
  );
  const branchIdx = header.findIndex((h) =>
    ['external_branch_id', 'branch_id', 'id_sucursal', 'sucursal_id'].includes(h)
  );
  const staffIdx = header.findIndex((h) =>
    ['external_assigned_user_id', 'assigned_user_id', 'veterinarian_id', 'id_profesional', 'profesional', 'vet_id'].includes(h)
  );
  if (patientIdx < 0 || filenameIdx < 0) {
    issues.push({
      rowNumber: 1,
      message: 'Cabeceras requeridas: external_patient_id, filename',
    });
    return { rows, issues };
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const externalPatientId = cols[patientIdx] ?? '';
    const filename = cols[filenameIdx] ?? '';
    if (!externalPatientId || !filename) {
      issues.push({ rowNumber: i + 1, message: 'Fila incompleta' });
      continue;
    }
    rows.push({
      externalPatientId,
      filename,
      externalBranchId: branchIdx >= 0 ? cols[branchIdx]?.trim() || null : null,
      externalAssignedUserId: staffIdx >= 0 ? cols[staffIdx]?.trim() || null : null,
    });
  }
  return { rows, issues };
}

export function guessMimeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return null;
}

export type HospitalizationImportRow = {
  rowNumber: number;
  externalHospitalizationId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  admittedAt: string;
  dischargedAt: string | null;
  reason: string;
  diagnosis: string | null;
  treatmentPlan: string | null;
  cage: string | null;
  status: string | null;
  originalVeterinarian: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validateHospitalizationRows(
  rows: HospitalizationImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalHospitalizationId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'hospitalizations',
        field: 'external_hospitalization_id',
        code: 'required',
        message: 'Falta ID externo de internación',
        severity: 'error',
      });
    } else if (seen.has(row.externalHospitalizationId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'hospitalizations',
        field: 'external_hospitalization_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalHospitalizationId);
    }
    pushMissingPatient(
      issues,
      row.rowNumber,
      'hospitalizations',
      row.externalPatientId,
      options?.knownPatientExternalIds
    );
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'hospitalizations',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'hospitalizations',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    if (!row.reason || row.reason.trim().length < 2) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'hospitalizations',
        field: 'reason',
        code: 'required',
        message: 'Falta motivo de internación',
        severity: 'error',
      });
    }
    if (!parseImportDate(row.admittedAt, locale).ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'hospitalizations',
        field: 'admitted_at',
        code: 'invalid_date',
        message: 'Fecha de ingreso inválida',
        severity: 'error',
      });
    }
    if (row.dischargedAt && !parseImportDate(row.dischargedAt, locale).ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'hospitalizations',
        field: 'discharged_at',
        code: 'invalid_date',
        message: 'Fecha de alta inválida',
        severity: 'error',
      });
    }
  }
  return issues;
}

export function buildHospitalizationTemplateCsv(): string {
  return toCsv(HOSPITALIZATION_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_hospitalization_id: 'HOSP-001',
      external_patient_id: 'PAT-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      admitted_at: '2024-09-01',
      discharged_at: '2024-09-05',
      reason: 'Gastroenteritis',
      diagnosis: 'GEA',
      treatment_plan: 'Fluidoterapia',
      cage: 'B2',
      status: 'alta',
      original_veterinarian: 'Dra. Garcia',
      notes: '',
      source_system: 'VetLegacy',
    },
  ]);
}

export type AppointmentImportRow = {
  rowNumber: number;
  externalAppointmentId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  startsAt: string;
  endsAt: string | null;
  appointmentType: string | null;
  status: string | null;
  title: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validateAppointmentRows(
  rows: AppointmentImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalAppointmentId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'appointments',
        field: 'external_appointment_id',
        code: 'required',
        message: 'Falta ID externo de cita',
        severity: 'error',
      });
    } else if (seen.has(row.externalAppointmentId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'appointments',
        field: 'external_appointment_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalAppointmentId);
    }
    pushMissingPatient(
      issues,
      row.rowNumber,
      'appointments',
      row.externalPatientId,
      options?.knownPatientExternalIds
    );
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'appointments',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'appointments',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    const starts = parseImportDateTime(row.startsAt, locale);
    if (!starts.ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'appointments',
        field: 'starts_at',
        code: 'invalid_datetime',
        message: 'Inicio inválido (usá YYYY-MM-DD HH:mm o ISO)',
        severity: 'error',
      });
    }
    if (row.endsAt) {
      const ends = parseImportDateTime(row.endsAt, locale);
      if (!ends.ok) {
        issues.push({
          rowNumber: row.rowNumber,
          entityType: 'appointments',
          field: 'ends_at',
          code: 'invalid_datetime',
          message: 'Fin inválido',
          severity: 'error',
        });
      } else if (starts.ok && ends.iso <= starts.iso) {
        issues.push({
          rowNumber: row.rowNumber,
          entityType: 'appointments',
          field: 'ends_at',
          code: 'invalid_range',
          message: 'Fin debe ser posterior al inicio',
          severity: 'error',
        });
      }
    }
  }

  // Soft overlap warnings within the same file (same patient).
  const timed = rows
    .map((row) => {
      const starts = parseImportDateTime(row.startsAt, locale);
      if (!starts.ok || !row.externalPatientId) return null;
      const ends = row.endsAt
        ? parseImportDateTime(row.endsAt, locale)
        : ({ ok: true as const, iso: new Date(new Date(starts.iso).getTime() + 30 * 60 * 1000).toISOString() });
      if (!ends.ok) return null;
      return {
        rowNumber: row.rowNumber,
        patient: row.externalPatientId,
        startMs: new Date(starts.iso).getTime(),
        endMs: new Date(ends.iso).getTime(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]!;
      const b = timed[j]!;
      if (a.patient !== b.patient) continue;
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        issues.push({
          rowNumber: a.rowNumber,
          entityType: 'appointments',
          field: 'starts_at',
          code: 'possible_overlap',
          message: `Posible solapamiento con fila ${b.rowNumber} del mismo paciente`,
          severity: 'warning',
          sourceReference: String(b.rowNumber),
        });
      }
    }
  }
  return issues;
}

export function buildAppointmentTemplateCsv(): string {
  return toCsv(APPOINTMENT_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_appointment_id: 'APT-001',
      external_patient_id: 'PAT-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      starts_at: '2024-10-01 10:00',
      ends_at: '2024-10-01 10:30',
      appointment_type: 'consulta',
      status: 'programada',
      title: 'Control anual',
      notes: '',
      source_system: 'legacy',
    },
  ]);
}

export type ConsultationImportRow = {
  rowNumber: number;
  externalConsultationId: string;
  externalPatientId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  externalAppointmentId: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string | null;
  title: string | null;
  anamnesis: string | null;
  physicalExam: string | null;
  diagnosis: string | null;
  treatment: string | null;
  plan: string | null;
  weightKg: string | null;
  temperatureC: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validateConsultationRows(
  rows: ConsultationImportRow[],
  options?: {
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = options?.knownPatientExternalIds;
  const locale = options?.locale ?? 'es-AR';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalConsultationId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'consultations',
        field: 'external_consultation_id',
        code: 'required',
        message: 'Falta ID externo de consulta',
        severity: 'error',
      });
    } else if (seen.has(row.externalConsultationId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'consultations',
        field: 'external_consultation_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalConsultationId);
    }
    if (!row.externalPatientId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'consultations',
        field: 'external_patient_id',
        code: 'required',
        message: 'Falta ID externo de paciente',
        severity: 'error',
      });
    } else if (known && !known.has(row.externalPatientId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'consultations',
        field: 'external_patient_id',
        code: 'unknown_patient',
        message: 'Paciente externo no mapeado',
        severity: 'error',
      });
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'consultations',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'consultations',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    const started = parseImportDateTime(row.startedAt, locale);
    if (!started.ok) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'consultations',
        field: 'started_at',
        code: 'invalid_datetime',
        message: 'Fecha/hora de inicio inválida',
        severity: 'error',
      });
    }
    if (row.completedAt) {
      const completed = parseImportDateTime(row.completedAt, locale);
      if (!completed.ok) {
        issues.push({
          rowNumber: row.rowNumber,
          entityType: 'consultations',
          field: 'completed_at',
          code: 'invalid_datetime',
          message: 'Fecha/hora de fin inválida',
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

export function buildConsultationTemplateCsv(): string {
  return toCsv(CONSULTATION_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_consultation_id: 'CON-001',
      external_patient_id: 'PAT-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      external_appointment_id: 'APT-001',
      started_at: '2024-10-01 10:05',
      completed_at: '2024-10-01 10:35',
      status: 'completada',
      title: 'Control anual',
      anamnesis: 'Sin síntomas',
      physical_exam: 'Buen estado general',
      diagnosis: 'Sano',
      treatment: '',
      plan: 'Control en 1 año',
      weight_kg: '12.5',
      temperature_c: '38.2',
      notes: '',
      source_system: 'legacy',
    },
  ]);
}

export type InventoryProductImportRow = {
  rowNumber: number;
  externalProductId: string;
  externalBranchId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  quantity: string | null;
  minQuantity: string | null;
  unitCost: string | null;
  unitPrice: string | null;
  manufacturer: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validateInventoryProductRows(
  rows: InventoryProductImportRow[],
  options?: { knownBranchExternalIds?: Set<string>; knownBranchInternalIds?: Set<string> }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.externalProductId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'inventory_products',
        field: 'external_product_id',
        code: 'required',
        message: 'Falta ID externo de producto',
        severity: 'error',
      });
    } else if (seen.has(row.externalProductId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'inventory_products',
        field: 'external_product_id',
        code: 'duplicate_in_file',
        message: 'ID externo duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalProductId);
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'inventory_products',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    if (!row.name || row.name.trim().length < 2) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'inventory_products',
        field: 'name',
        code: 'required',
        message: 'Falta nombre de producto',
        severity: 'error',
      });
    }
    if (row.quantity != null && row.quantity !== '' && Number.isNaN(Number(row.quantity))) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'inventory_products',
        field: 'quantity',
        code: 'invalid_number',
        message: 'Cantidad inválida',
        severity: 'error',
      });
    }
    if (row.minQuantity != null && row.minQuantity !== '' && Number.isNaN(Number(row.minQuantity))) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'inventory_products',
        field: 'min_quantity',
        code: 'invalid_number',
        message: 'Stock mínimo inválido',
        severity: 'error',
      });
    }
  }
  return issues;
}

export function buildInventoryProductTemplateCsv(): string {
  return toCsv(INVENTORY_PRODUCT_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_product_id: 'PROD-001',
      external_branch_id: 'BR-001',
      name: 'Amoxicilina 250mg',
      sku: 'AMOX-250',
      category: 'medicamento',
      unit: 'caja',
      quantity: '12',
      min_quantity: '2',
      unit_cost: '1500',
      unit_price: '2800',
      manufacturer: 'Lab Vet',
      notes: '',
      source_system: 'legacy',
    },
  ]);
}

export type InvoiceImportRow = {
  rowNumber: number;
  externalInvoiceId: string;
  externalBranchId: string | null;
  externalAssignedUserId: string | null;
  externalOwnerId: string | null;
  externalPatientId: string | null;
  number: string | null;
  status: string | null;
  issuedAt: string | null;
  currency: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  total: string | null;
  paidAmount: string | null;
  balance: string | null;
  description: string | null;
  quantity: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  externalProductId: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validateInvoiceRows(
  rows: InvoiceImportRow[],
  options?: {
    knownOwnerExternalIds?: Set<string>;
    knownPatientExternalIds?: Set<string>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownOwners = options?.knownOwnerExternalIds;
  const knownPatients = options?.knownPatientExternalIds;
  for (const row of rows) {
    if (!row.externalInvoiceId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'invoices',
        field: 'external_invoice_id',
        code: 'required',
        message: 'Falta ID externo de factura',
        severity: 'error',
      });
    }
    pushUnmappedBranchIssue(
      issues,
      row.rowNumber,
      'invoices',
      row.externalBranchId,
      options?.knownBranchExternalIds,
      options?.knownBranchInternalIds
    );
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'invoices',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    if (!row.externalOwnerId && !row.externalPatientId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'invoices',
        field: 'external_owner_id',
        code: 'required',
        message: 'Indicá propietario o paciente externo',
        severity: 'error',
      });
    }
    if (row.externalOwnerId && knownOwners && !knownOwners.has(row.externalOwnerId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'invoices',
        field: 'external_owner_id',
        code: 'unknown_owner',
        message: 'Propietario externo no mapeado',
        severity: 'error',
      });
    }
    if (row.externalPatientId && knownPatients && !knownPatients.has(row.externalPatientId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'invoices',
        field: 'external_patient_id',
        code: 'unknown_patient',
        message: 'Paciente externo no mapeado',
        severity: 'error',
      });
    }
    const hasLine =
      Boolean(row.description?.trim()) ||
      (row.quantity != null && row.quantity !== '') ||
      (row.unitPrice != null && row.unitPrice !== '');
    if (hasLine && !row.description?.trim()) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'invoices',
        field: 'description',
        code: 'required',
        message: 'Falta descripción del ítem',
        severity: 'error',
      });
    }
    for (const [field, value] of [
      ['quantity', row.quantity],
      ['unit_price', row.unitPrice],
      ['line_total', row.lineTotal],
      ['subtotal', row.subtotal],
      ['tax_amount', row.taxAmount],
      ['total', row.total],
      ['paid_amount', row.paidAmount],
      ['balance', row.balance],
    ] as const) {
      if (value != null && value !== '' && Number.isNaN(Number(String(value).replace(',', '.')))) {
        issues.push({
          rowNumber: row.rowNumber,
          entityType: 'invoices',
          field,
          code: 'invalid_number',
          message: `Número inválido en ${field}`,
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

export function buildInvoiceTemplateCsv(): string {
  return toCsv(INVOICE_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_invoice_id: 'INV-001',
      external_branch_id: 'BR-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      external_owner_id: 'OWN-001',
      external_patient_id: 'PAT-001',
      number: 'A-0001',
      status: 'emitida',
      issued_at: '2024-11-01',
      currency: 'ARS',
      subtotal: '5000',
      tax_amount: '0',
      total: '5000',
      paid_amount: '0',
      balance: '5000',
      description: 'Consulta general',
      quantity: '1',
      unit_price: '5000',
      line_total: '5000',
      external_product_id: '',
      notes: '',
      source_system: 'legacy',
    },
  ]);
}

export type PaymentImportRow = {
  rowNumber: number;
  externalPaymentId: string;
  externalInvoiceId: string;
  externalAssignedUserId: string | null;
  amount: string;
  method: string | null;
  paidAt: string | null;
  reference: string | null;
  notes: string | null;
  sourceSystem: string | null;
};

export function validatePaymentRows(
  rows: PaymentImportRow[],
  options?: {
    knownInvoiceExternalIds?: Set<string>;
    invoicePaidAmountByExternal?: Map<string, number>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownInvoices = options?.knownInvoiceExternalIds;
  const paidByInvoice = options?.invoicePaidAmountByExternal;
  const seen = new Set<string>();
  const sums = new Map<string, { total: number; firstRow: number }>();
  for (const row of rows) {
    if (!row.externalPaymentId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'payments',
        field: 'external_payment_id',
        code: 'required',
        message: 'Falta ID externo de pago',
        severity: 'error',
      });
    } else if (seen.has(row.externalPaymentId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'payments',
        field: 'external_payment_id',
        code: 'duplicate_in_file',
        message: 'ID externo de pago duplicado en el archivo',
        severity: 'error',
      });
    } else {
      seen.add(row.externalPaymentId);
    }
    if (!row.externalInvoiceId) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'payments',
        field: 'external_invoice_id',
        code: 'required',
        message: 'Falta ID externo de factura',
        severity: 'error',
      });
    } else if (knownInvoices && !knownInvoices.has(row.externalInvoiceId)) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'payments',
        field: 'external_invoice_id',
        code: 'unknown_invoice',
        message: 'Factura externa no mapeada',
        severity: 'error',
      });
    }
    pushUnmappedStaffIssue(
      issues,
      row.rowNumber,
      'payments',
      row.externalAssignedUserId,
      options?.knownStaffExternalIds,
      options?.knownStaffInternalIds
    );
    const amount = Number(String(row.amount ?? '').replace(',', '.'));
    if (!row.amount || Number.isNaN(amount) || amount <= 0) {
      issues.push({
        rowNumber: row.rowNumber,
        entityType: 'payments',
        field: 'amount',
        code: 'invalid_number',
        message: 'Monto de pago inválido',
        severity: 'error',
      });
    } else if (row.externalInvoiceId) {
      const prev = sums.get(row.externalInvoiceId);
      if (prev) {
        prev.total += amount;
      } else {
        sums.set(row.externalInvoiceId, { total: amount, firstRow: row.rowNumber });
      }
    }
  }
  if (paidByInvoice && paidByInvoice.size > 0) {
    for (const [invoiceId, agg] of sums) {
      if (!paidByInvoice.has(invoiceId)) continue;
      const expected = paidByInvoice.get(invoiceId) ?? 0;
      if (Math.abs(expected - agg.total) > 0.009) {
        issues.push({
          rowNumber: agg.firstRow,
          entityType: 'payments',
          field: 'amount',
          code: 'paid_amount_mismatch',
          message: `Suma de pagos (${agg.total}) ≠ paid_amount de factura (${expected})`,
          severity: 'warning',
          recommendedAction: 'Revisá CSV de facturas/pagos; no se recalcula automáticamente',
        });
      }
    }
  }
  return issues;
}

export function buildPaymentTemplateCsv(): string {
  return toCsv(PAYMENT_IMPORT_FIELDS.map((f) => f.key), [
    {
      external_payment_id: 'PAY-001',
      external_invoice_id: 'INV-001',
      external_assigned_user_id: 'VET-LEGACY-01',
      amount: '5000',
      method: 'transferencia',
      paid_at: '2024-11-02',
      reference: 'TRX-123',
      notes: '',
      source_system: 'legacy',
    },
  ]);
}

/** Default unresolved duplicate warnings to review (never silent create/link). */
export function defaultDecisionForIssue(issue: ValidationIssue): ConflictPolicy {
  if (issue.code !== 'possible_duplicate') return 'create';
  return 'review';
}

export function unresolvedConflictRows(
  issues: ValidationIssue[],
  decisions: Record<number, RowConflictDecision>
): number[] {
  const rows = new Set<number>();
  for (const issue of issues) {
    if (issue.code !== 'possible_duplicate') continue;
    const decision = decisions[issue.rowNumber]?.decision ?? 'review';
    if (decision === 'review') rows.add(issue.rowNumber);
    if (decision === 'link' && !decisions[issue.rowNumber]?.linkInternalId && !issue.matchInternalId) {
      rows.add(issue.rowNumber);
    }
  }
  return [...rows].sort((a, b) => a - b);
}

export function summarizeIssues(issues: ValidationIssue[]) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return { errors, warnings };
}

export function buildValidationReportCsv(issues: ValidationIssue[]): string {
  return toCsv(
    [
      'row_number',
      'entity_type',
      'field',
      'code',
      'severity',
      'message',
      'recommended_action',
      'source_reference',
      'match_internal_id',
    ],
    issues.map((issue) => ({
      row_number: issue.rowNumber,
      entity_type: issue.entityType,
      field: issue.field ?? '',
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      recommended_action: issue.recommendedAction ?? '',
      source_reference: issue.sourceReference ?? '',
      match_internal_id: issue.matchInternalId ?? '',
    }))
  );
}

export function buildBatchErrorsReportCsv(
  rows: Array<{
    rowNumber?: number | null;
    entityType?: string | null;
    errorCode?: string | null;
    errorMessage: string;
    fieldName?: string | null;
    sourceReference?: string | null;
    severity?: string | null;
    recommendedAction?: string | null;
  }>
): string {
  return toCsv(
    [
      'row_number',
      'entity_type',
      'error_code',
      'severity',
      'error_message',
      'field_name',
      'source_reference',
      'recommended_action',
    ],
    rows.map((row) => ({
      row_number: row.rowNumber ?? '',
      entity_type: row.entityType ?? '',
      error_code: row.errorCode ?? '',
      severity: row.severity ?? '',
      error_message: row.errorMessage,
      field_name: row.fieldName ?? '',
      source_reference: row.sourceReference ?? '',
      recommended_action: row.recommendedAction ?? '',
    }))
  );
}

export function sumOrphanCounts(counts: Record<string, number> | null | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((acc, n) => acc + (Number.isFinite(n) ? Number(n) : 0), 0);
}

export function buildIntegrityReportCsv(input: {
  organizationId: string;
  generatedAt?: string | null;
  imports?: Record<string, unknown>;
  exports?: Record<string, unknown>;
  createdRowsTracked?: number;
  idMapEntries?: number;
  orphansCreated?: Record<string, number>;
  orphansIdMap?: Record<string, number>;
  stuckImports?: number;
  stuckExports?: number;
}): string {
  const metricRows: Array<Record<string, unknown>> = [
    { section: 'meta', key: 'organization_id', value: input.organizationId },
    { section: 'meta', key: 'generated_at', value: input.generatedAt ?? '' },
    { section: 'meta', key: 'created_rows_tracked', value: input.createdRowsTracked ?? 0 },
    { section: 'meta', key: 'id_map_entries', value: input.idMapEntries ?? 0 },
    { section: 'stuck_locks', key: 'imports', value: input.stuckImports ?? 0 },
    { section: 'stuck_locks', key: 'exports', value: input.stuckExports ?? 0 },
  ];
  for (const [key, value] of Object.entries(input.imports ?? {})) {
    metricRows.push({ section: 'imports', key, value });
  }
  for (const [key, value] of Object.entries(input.exports ?? {})) {
    metricRows.push({ section: 'exports', key, value });
  }
  for (const [key, value] of Object.entries(input.orphansCreated ?? {})) {
    metricRows.push({ section: 'orphans_created_rows', key, value });
  }
  for (const [key, value] of Object.entries(input.orphansIdMap ?? {})) {
    metricRows.push({ section: 'orphans_id_map', key, value });
  }
  return toCsv(['section', 'key', 'value'], metricRows);
}

export function buildIdMapReportCsv(
  rows: Array<{
    entityType: string;
    externalId: string;
    internalId: string;
    createdAt?: string | null;
  }>
): string {
  return toCsv(
    ['entity_type', 'external_id', 'internal_id', 'created_at'],
    rows.map((row) => ({
      entity_type: row.entityType,
      external_id: row.externalId,
      internal_id: row.internalId,
      created_at: row.createdAt ?? '',
    }))
  );
}

export type MigrationChecklistItem = {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | string;
  count?: number | null;
  detail?: string | null;
};

export function summarizeMigrationChecklist(items: MigrationChecklistItem[]): {
  ok: number;
  warn: number;
  fail: number;
  total: number;
} {
  let ok = 0;
  let warn = 0;
  let fail = 0;
  for (const item of items) {
    if (item.status === 'ok') ok += 1;
    else if (item.status === 'fail') fail += 1;
    else warn += 1;
  }
  return { ok, warn, fail, total: items.length };
}

export function buildMigrationChecklistCsv(
  items: MigrationChecklistItem[],
  meta?: { organizationId?: string; generatedAt?: string | null; readyForGolive?: boolean }
): string {
  const rows: Array<Record<string, unknown>> = [
    {
      section: 'meta',
      key: 'organization_id',
      status: '',
      count: '',
      detail: meta?.organizationId ?? '',
    },
    {
      section: 'meta',
      key: 'generated_at',
      status: '',
      count: '',
      detail: meta?.generatedAt ?? '',
    },
    {
      section: 'meta',
      key: 'ready_for_golive',
      status: meta?.readyForGolive ? 'ok' : 'warn',
      count: '',
      detail: meta?.readyForGolive ? 'true' : 'false',
    },
    ...items.map((item) => ({
      section: 'check',
      key: item.key,
      status: item.status,
      count: item.count ?? '',
      detail: item.detail ?? item.label,
    })),
  ];
  return toCsv(['section', 'key', 'status', 'count', 'detail'], rows);
}

export type BillingReconcileRow = {
  invoiceId: string;
  invoiceNumber?: string | null;
  status?: string | null;
  total?: number | null;
  paidAmount?: number | null;
  balance?: number | null;
  paymentsSum?: number | null;
  paymentsCount?: number | null;
  delta?: number | null;
};

export function buildBillingReconcileCsv(
  rows: BillingReconcileRow[],
  meta?: {
    organizationId?: string;
    generatedAt?: string | null;
    summary?: Record<string, number | string | null | undefined>;
  }
): string {
  const out: Array<Record<string, unknown>> = [
    {
      section: 'meta',
      invoice_id: '',
      invoice_number: '',
      status: '',
      total: '',
      paid_amount: '',
      balance: '',
      payments_sum: '',
      payments_count: '',
      delta: '',
      note: meta?.organizationId ?? '',
    },
    {
      section: 'meta',
      invoice_id: '',
      invoice_number: '',
      status: '',
      total: '',
      paid_amount: '',
      balance: '',
      payments_sum: '',
      payments_count: '',
      delta: '',
      note: meta?.generatedAt ?? '',
    },
  ];
  for (const [key, value] of Object.entries(meta?.summary ?? {})) {
    out.push({
      section: 'summary',
      invoice_id: key,
      invoice_number: '',
      status: '',
      total: '',
      paid_amount: '',
      balance: '',
      payments_sum: '',
      payments_count: '',
      delta: '',
      note: value ?? '',
    });
  }
  for (const row of rows) {
    out.push({
      section: 'invoice',
      invoice_id: row.invoiceId,
      invoice_number: row.invoiceNumber ?? '',
      status: row.status ?? '',
      total: row.total ?? '',
      paid_amount: row.paidAmount ?? '',
      balance: row.balance ?? '',
      payments_sum: row.paymentsSum ?? '',
      payments_count: row.paymentsCount ?? '',
      delta: row.delta ?? '',
      note: '',
    });
  }
  return toCsv(
    [
      'section',
      'invoice_id',
      'invoice_number',
      'status',
      'total',
      'paid_amount',
      'balance',
      'payments_sum',
      'payments_count',
      'delta',
      'note',
    ],
    out
  );
}

/** Phase 26: human-readable cutover freeze pack README (bundled in ZIP). */
export type CutoverPackSummaryInput = {
  organizationId: string;
  generatedAt: string;
  readyForGolive: boolean;
  checklistScoreOk: number;
  checklistScoreTotal: number;
  orphanCreatedTotal: number;
  orphanIdMapTotal: number;
  stuckImports: number;
  stuckExports: number;
  billingMismatch: number;
  billingPaidWithoutPayments: number;
  formatVersion?: string;
};

export function buildCutoverPackReadme(input: CutoverPackSummaryInput): string {
  const stuck = input.stuckImports + input.stuckExports;
  const orphans = input.orphanCreatedTotal + input.orphanIdMapTotal;
  const lines = [
    'SyncVete — Paquete cutover (freeze)',
    `Formato: ${DATA_MIGRATION_FORMAT} ${input.formatVersion ?? DATA_MIGRATION_FORMAT_VERSION} · multi-sede + staff round-trip`,
    `Organización: ${input.organizationId}`,
    `Tipos de exportación disponibles: ${EXPORT_TYPES.length}`,
    `Generado: ${input.generatedAt}`,
    '',
    `Listo para go-live: ${input.readyForGolive ? 'SÍ' : 'NO — revisar pendientes'}`,
    `Checklist: ${input.checklistScoreOk}/${input.checklistScoreTotal} OK`,
    `Huérfanos (created + id-map): ${orphans}`,
    `Locks trabados: ${stuck}`,
    `Facturas paid sin pagos: ${input.billingPaidWithoutPayments}`,
    `Desvíos paid_amount vs pagos: ${input.billingMismatch}`,
    '',
    'Contenido del ZIP:',
    '- README.txt (este archivo)',
    '- integrity.csv',
    '- checklist.csv',
    '- billing_reconcile.csv',
    '- export_catalog.csv',
    '- freeze_recommendations.csv',
    '- id_map.csv',
    '- staff_map_template.csv',
    '- branch_map_template.csv',
    '- attachments_meta_template.csv',
    '- roundtrip_notes.txt',
    '',
    `Pack version: ${CUTOVER_PACK_VERSION}`,
    'Antes del freeze, exportá también (ver freeze_recommendations.csv):',
    ...CUTOVER_FREEZE_EXPORT_RECOMMENDATIONS.map(
      (r) => `  [${r.priority}] ${r.exportType} — ${r.reason}`
    ),
    '',
    'Hito fase 50: export ZIP emite attachments_meta.csv para round-trip de adjuntos.',
    'Solo lectura: no modifica datos, planes ni caja.',
    'Revisá fail/warn del checklist antes del cutover.',
  ];
  return `${lines.join('\n')}\n`;
}

export function isCutoverPackReady(input: {
  readyForGolive: boolean;
  orphanCreatedTotal: number;
  orphanIdMapTotal: number;
  stuckImports: number;
  stuckExports: number;
  billingMismatch: number;
}): boolean {
  return (
    input.readyForGolive &&
    input.orphanCreatedTotal === 0 &&
    input.orphanIdMapTotal === 0 &&
    input.stuckImports === 0 &&
    input.stuckExports === 0 &&
    input.billingMismatch === 0
  );
}

/** Phase 31: catalog of export types for cutover pack. */
export function buildExportCatalogCsv(): string {
  return toCsv(
    ['export_type', 'label', 'importable', 'notes'],
    EXPORT_TYPES.map((key) => {
      const importable =
        key !== 'patient_clinical' &&
        key !== 'full_clinic' &&
        (IMPORT_TYPES as readonly string[]).includes(key);
      let notes = '';
      if (
        key === 'cash_sessions' ||
        key === 'inventory_movements' ||
        key === 'clinical_images' ||
        key === 'reminder_logs' ||
        key === 'whatsapp_messages' ||
        key === 'audit_logs' ||
        key === 'notifications' ||
        key === 'staff_profiles'
      ) {
        notes = 'export_only';
      } else if (key === 'full_clinic' || key === 'patient_clinical') {
        notes = 'bundle';
      } else if (importable) {
        notes = 'roundtrip';
      }
      return {
        export_type: key,
        label: EXPORT_TYPE_LABELS[key],
        importable: importable ? 'yes' : 'no',
        notes,
      };
    })
  );
}

/** Recommended historical exports before freeze (not auto-run). */
export const CUTOVER_FREEZE_EXPORT_RECOMMENDATIONS: ReadonlyArray<{
  exportType: ExportType;
  priority: 'required' | 'recommended' | 'optional';
  reason: string;
}> = [
  { exportType: 'full_clinic', priority: 'required', reason: 'Backup operativo completo del tenant' },
  {
    exportType: 'staff_profiles',
    priority: 'required',
    reason: 'Base para armar staff_map (external → internal_user_id)',
  },
  { exportType: 'branches', priority: 'required', reason: 'Base para armar branch_map / multi-sede' },
  { exportType: 'audit_logs', priority: 'recommended', reason: 'Pista forense inmutable' },
  { exportType: 'cash_sessions', priority: 'recommended', reason: 'Historial de caja (solo lectura)' },
  {
    exportType: 'clinical_images',
    priority: 'recommended',
    reason: 'Catálogo de adjuntos (metadata; binarios van en ZIP de exportación/import)',
  },
  { exportType: 'payments', priority: 'recommended', reason: 'Cobros sin reabrir caja' },
  { exportType: 'whatsapp_messages', priority: 'optional', reason: 'Historial CRM WhatsApp' },
  { exportType: 'reminder_logs', priority: 'optional', reason: 'Historial de recordatorios' },
] as const;

export function buildFreezeRecommendationsCsv(): string {
  return toCsv(
    ['priority', 'export_type', 'label', 'reason'],
    CUTOVER_FREEZE_EXPORT_RECOMMENDATIONS.map((row) => ({
      priority: row.priority,
      export_type: row.exportType,
      label: EXPORT_TYPE_LABELS[row.exportType],
      reason: row.reason,
    }))
  );
}

/** Phase 32: org-wide id-map CSV (batch_id + external → internal). */
export type OrgIdMapRow = {
  batchId: string;
  entityType: string;
  externalId: string;
  internalId: string;
  createdAt?: string | null;
};

export function buildOrgIdMapCsv(
  rows: OrgIdMapRow[],
  meta?: { organizationId?: string; generatedAt?: string | null; truncated?: boolean }
): string {
  const out: Array<Record<string, unknown>> = [
    {
      section: 'meta',
      batch_id: '',
      entity_type: 'organization_id',
      external_id: meta?.organizationId ?? '',
      internal_id: '',
      created_at: meta?.generatedAt ?? '',
    },
    {
      section: 'meta',
      batch_id: '',
      entity_type: 'row_count',
      external_id: String(rows.length),
      internal_id: meta?.truncated ? 'truncated' : 'complete',
      created_at: '',
    },
    ...rows.map((row) => ({
      section: 'map',
      batch_id: row.batchId,
      entity_type: row.entityType,
      external_id: row.externalId,
      internal_id: row.internalId,
      created_at: row.createdAt ?? '',
    })),
  ];
  return toCsv(
    ['section', 'batch_id', 'entity_type', 'external_id', 'internal_id', 'created_at'],
    out
  );
}
