import 'server-only';

import {
  CLINICAL_ENTRY_TYPES,
  DEFAULT_IMPORT_CHUNK_SIZE,
  PATIENT_SEX,
  PATIENT_SPECIES,
  chunkRange,
  mapRow,
  parseCsv,
  parseImportDate,
  resolveImportBranchId,
  resolveImportStaffUserId,
  type ConflictPolicy,
  type DateLocale,
  type IdempotencyMode,
  type RowConflictDecision,
} from '@sincvete/shared';
import { createServiceClient } from '@/lib/supabase/server';
import {
  commitSpecialtySlice,
  type SpecialtyEntity,
} from '@/lib/data-migration/specialty';
import type { MigrationDb } from '@/lib/data-migration/db';

const SPECIALTY: SpecialtyEntity[] = [
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
  'appointments',
  'consultations',
  'inventory_products',
  'invoices',
  'payments',
];

export function isSpecialtyCheck(entity: string): entity is SpecialtyEntity {
  return (SPECIALTY as string[]).includes(entity);
}

function normalizeSpecies(value: string) {
  const v = value.trim().toLowerCase();
  const match = PATIENT_SPECIES.find((s) => s.toLowerCase() === v);
  return match ?? 'Otro';
}

function normalizeSex(value: string) {
  const v = value.trim().toLowerCase();
  const match = PATIENT_SEX.find((s) => s.toLowerCase() === v);
  return match ?? 'Desconocido';
}

function normalizeEntryType(value: string) {
  const v = value.trim().toLowerCase();
  return CLINICAL_ENTRY_TYPES.find((t) => t === v) ?? 'otro';
}

export { commitSpecialtySlice };

export async function commitCoreEntitySlice(input: {
  organizationId: string;
  userId: string | null;
  batchId: string;
  entity: string;
  mapping: Record<string, string | null>;
  sourceSystem?: string | null;
  idempotencyMode?: IdempotencyMode;
  ownerIdByExternal: Record<string, string>;
  patientIdByExternal: Record<string, string>;
  branchIdByExternal?: Record<string, string>;
  userIdByExternal?: Record<string, string>;
  knownStaffInternalIds?: Set<string>;
  knownBranchInternalIds?: Set<string>;
  branchId: string;
  offset: number;
  limit: number;
  totalRows: number;
  rows: Record<string, string>[];
  rowDecisions: Record<number, RowConflictDecision>;
  dateLocale?: string;
}) {
  const service = (await createServiceClient()) as unknown as MigrationDb;
  const locale = (input.dateLocale ?? 'es-AR') as DateLocale;
  const nowIso = new Date().toISOString();
  const sourceSystem = input.sourceSystem ?? 'import';
  const skipExisting = input.idempotencyMode === 'skip_existing_source';
  const slice = input.rows.slice(input.offset, input.offset + input.limit);
  const decisions = input.rowDecisions;
  let imported = 0;
  let failed = 0;
  let linked = 0;
  let skipped = 0;
  const idMap: Record<string, string> = {};
  const userId = input.userId;

  async function existingSource(table: string, sourceRecordId: string): Promise<string | null> {
    if (!skipExisting || !sourceRecordId) return null;
    const { data } = await service
      .from(table)
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('source_system', sourceSystem)
      .eq('source_record_id', sourceRecordId)
      .is('deleted_at', null)
      .maybeSingle();
    return data?.id ? String(data.id) : null;
  }

  function parseBranchIsActive(value: string | null | undefined): boolean {
    if (!value || !String(value).trim()) return true;
    const v = String(value).trim().toLowerCase();
    if (['false', '0', 'no', 'inactive', 'inactivo', 'inactiva'].includes(v)) return false;
    return true;
  }

  if (input.entity === 'branches') {
    for (let i = 0; i < slice.length; i++) {
      const mapped = mapRow(slice[i]!, input.mapping);
      const externalBranchId = mapped.external_branch_id ?? '';
      const code = (mapped.code ?? '').trim().toUpperCase();
      const rowSourceSystem = mapped.source_system || sourceSystem;
      if (!mapped.name || !code || !externalBranchId) {
        failed += 1;
        continue;
      }
      const existingId = skipExisting
        ? await (async () => {
            const { data } = await service
              .from('branches')
              .select('id')
              .eq('organization_id', input.organizationId)
              .eq('source_system', rowSourceSystem)
              .eq('source_record_id', externalBranchId)
              .is('deleted_at', null)
              .maybeSingle();
            return data?.id ? String(data.id) : null;
          })()
        : null;
      if (existingId) {
        idMap[externalBranchId] = existingId;
        skipped += 1;
        continue;
      }
      const { data, error } = await service
        .from('branches')
        .insert({
          organization_id: input.organizationId,
          name: mapped.name.trim(),
          code,
          address: mapped.address || null,
          phone: mapped.phone || null,
          email: mapped.email || null,
          timezone: mapped.timezone?.trim() || 'America/Argentina/Buenos_Aires',
          is_active: parseBranchIsActive(mapped.is_active),
          is_main: false,
          import_batch_id: input.batchId,
          source_system: rowSourceSystem,
          source_record_id: externalBranchId,
          imported_at: nowIso,
          imported_by: userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[externalBranchId] = String(data.id);
      await service.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'branches',
        entity_id: data.id,
        external_id: externalBranchId,
      });
    }
  } else if (input.entity === 'owners') {
    for (let i = 0; i < slice.length; i++) {
      const raw = slice[i]!;
      const mapped = mapRow(raw, input.mapping);
      const rowNumber = input.offset + i + 2;
      const externalOwnerId = mapped.external_owner_id ?? '';
      const decision = (decisions[rowNumber]?.decision ?? 'create') as ConflictPolicy;
      if (decision === 'skip' || decision === 'review') {
        skipped += 1;
        continue;
      }
      if (decision === 'link') {
        const linkId = decisions[rowNumber]?.linkInternalId;
        if (!linkId) {
          failed += 1;
          continue;
        }
        idMap[externalOwnerId] = linkId;
        linked += 1;
        continue;
      }
      if (!mapped.full_name) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: mapped.external_branch_id || null,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const existingId = await existingSource('owners', externalOwnerId);
      if (existingId) {
        idMap[externalOwnerId] = existingId;
        skipped += 1;
        continue;
      }
      const { data, error } = await service
        .from('owners')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          full_name: mapped.full_name,
          document_type: mapped.document_type || null,
          document_number: mapped.document_number || null,
          phone: mapped.phone || null,
          email: mapped.email || null,
          address: mapped.address || null,
          city: mapped.city || null,
          province: mapped.province || null,
          postal_code: mapped.postal_code || null,
          notes: mapped.notes || null,
          import_batch_id: input.batchId,
          source_system: sourceSystem,
          source_record_id: externalOwnerId,
          imported_at: nowIso,
          imported_by: userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[externalOwnerId] = String(data.id);
      await service.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'owners',
        entity_id: data.id,
        external_id: externalOwnerId,
      });
    }
  } else if (input.entity === 'patients') {
    for (let i = 0; i < slice.length; i++) {
      const raw = slice[i]!;
      const mapped = mapRow(raw, input.mapping);
      const rowNumber = input.offset + i + 2;
      const externalPatientId = mapped.external_patient_id ?? '';
      const decision = (decisions[rowNumber]?.decision ?? 'create') as ConflictPolicy;
      if (decision === 'skip' || decision === 'review') {
        skipped += 1;
        continue;
      }
      if (decision === 'link') {
        const linkId = decisions[rowNumber]?.linkInternalId;
        if (!linkId) {
          failed += 1;
          continue;
        }
        idMap[externalPatientId] = linkId;
        linked += 1;
        continue;
      }
      const ownerId = input.ownerIdByExternal[mapped.external_owner_id ?? ''];
      if (!ownerId || !mapped.name) {
        failed += 1;
        continue;
      }
      const birth = mapped.birth_date ? parseImportDate(mapped.birth_date, locale) : null;
      if (mapped.birth_date && (!birth || !birth.ok)) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: mapped.external_branch_id || null,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const existingId = await existingSource('patients', externalPatientId);
      if (existingId) {
        idMap[externalPatientId] = existingId;
        skipped += 1;
        continue;
      }
      const { data, error } = await service
        .from('patients')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          owner_id: ownerId,
          name: mapped.name,
          species: normalizeSpecies(mapped.species ?? ''),
          breed: mapped.breed || null,
          sex: normalizeSex(mapped.sex ?? ''),
          birth_date: birth && birth.ok ? birth.isoDate : null,
          microchip: mapped.microchip || null,
          color: mapped.color || null,
          notes: mapped.notes || null,
          import_batch_id: input.batchId,
          source_system: sourceSystem,
          source_record_id: externalPatientId,
          imported_at: nowIso,
          imported_by: userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[externalPatientId] = String(data.id);
      await service.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'patients',
        entity_id: data.id,
        external_id: externalPatientId,
      });
    }
  } else if (input.entity === 'clinical_entries') {
    for (let i = 0; i < slice.length; i++) {
      const mapped = mapRow(slice[i]!, input.mapping);
      const patientId = input.patientIdByExternal[mapped.external_patient_id ?? ''];
      const date = parseImportDate(mapped.original_date ?? '', locale);
      if (!patientId || !date.ok) {
        failed += 1;
        continue;
      }
      const { data: patient } = await service
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: mapped.external_branch_id || null,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: mapped.external_assigned_user_id || null,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const externalClinicalId = mapped.external_clinical_record_id ?? '';
      const existingId = await existingSource('clinical_entries', externalClinicalId);
      if (existingId) {
        skipped += 1;
        continue;
      }
      const { data, error } = await service
        .from('clinical_entries')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          entry_date: `${date.isoDate}T12:00:00.000Z`,
          entry_type: normalizeEntryType(mapped.record_type || 'consulta'),
          title: mapped.reason || null,
          anamnesis: mapped.anamnesis || null,
          physical_exam: mapped.clinical_findings || null,
          diagnosis: mapped.diagnosis || null,
          treatment: mapped.treatment || null,
          plan: mapped.observations || null,
          recorded_by: staffResolved.userId,
          import_batch_id: input.batchId,
          source_system: mapped.source_system || sourceSystem,
          source_record_id: mapped.external_clinical_record_id || null,
          original_created_at: `${date.isoDate}T12:00:00.000Z`,
          original_professional_name: mapped.original_veterinarian || null,
          imported_at: nowIso,
          imported_by: userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      await service.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'clinical_entries',
        entity_id: data.id,
        external_id: mapped.external_clinical_record_id || null,
      });
    }
  } else if (input.entity === 'vaccinations') {
    for (let i = 0; i < slice.length; i++) {
      const mapped = mapRow(slice[i]!, input.mapping);
      const patientId = input.patientIdByExternal[mapped.external_patient_id ?? ''];
      const administered = parseImportDate(mapped.administered_at ?? '', locale);
      if (!patientId || !administered.ok || !(mapped.vaccine_name ?? '').trim()) {
        failed += 1;
        continue;
      }
      const { data: patient } = await service
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: mapped.external_branch_id || null,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: mapped.external_assigned_user_id || null,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const externalVaccinationId = mapped.external_vaccination_id ?? '';
      const existingId = await existingSource('vaccinations', externalVaccinationId);
      if (existingId) {
        skipped += 1;
        continue;
      }
      const { data, error } = await service
        .from('vaccinations')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          vaccine_name: mapped.vaccine_name!.trim(),
          manufacturer: mapped.manufacturer || null,
          lot_number: mapped.lot_number || null,
          administered_at: administered.isoDate,
          notes: mapped.notes || null,
          veterinarian_id: staffResolved.userId,
          import_batch_id: input.batchId,
          source_system: mapped.source_system || sourceSystem,
          source_record_id: mapped.external_vaccination_id || null,
          original_created_at: `${administered.isoDate}T12:00:00.000Z`,
          original_professional_name: mapped.original_veterinarian || null,
          imported_at: nowIso,
          imported_by: userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      await service.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'vaccinations',
        entity_id: data.id,
        external_id: mapped.external_vaccination_id || null,
      });
    }
  } else {
    failed += slice.length;
  }

  return { imported, failed, linked, skipped, idMap };
}

export async function processNextQueuedImportChunk(options?: {
  maxBatches?: number;
  chunkSize?: number;
}) {
  const maxBatches = options?.maxBatches ?? 3;
  const chunkSize = options?.chunkSize ?? DEFAULT_IMPORT_CHUNK_SIZE;
  const service = (await createServiceClient()) as unknown as MigrationDb;

  const { data: batches, error } = await service
    .from('data_import_batches')
    .select('*')
    .eq('status', 'queued')
    .not('storage_path', 'is', null)
    .order('queued_at', { ascending: true })
    .limit(maxBatches);
  if (error) throw new Error(error.message);

  const results: Array<Record<string, unknown>> = [];

  for (const batch of (batches ?? []) as Array<Record<string, unknown>>) {
    const batchId = String(batch.id);
    const organizationId = String(batch.organization_id);

    if (batch.cancel_requested_at || batch.status === 'cancelled') {
      await service
        .from('data_import_batches')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          worker_locked_at: null,
          worker_lock_token: null,
          progress_message: 'Cancelado por el usuario',
        })
        .eq('id', batchId);
      results.push({ batchId, skipped: 'cancelled' });
      continue;
    }

    const { count: activeCount } = await service
      .from('data_import_batches')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'importing')
      .neq('id', batchId);
    if ((activeCount ?? 0) > 0) {
      results.push({ batchId, skipped: 'org_busy' });
      continue;
    }

    const metadata = (batch.metadata ?? {}) as {
      entity?: string;
      branchId?: string;
      ownerIdByExternal?: Record<string, string>;
      patientIdByExternal?: Record<string, string>;
      productIdByExternal?: Record<string, string>;
      invoiceIdByExternal?: Record<string, string>;
      appointmentIdByExternal?: Record<string, string>;
      branchIdByExternal?: Record<string, string>;
      userIdByExternal?: Record<string, string>;
    };
    const entity = String(metadata.entity ?? '');
    const branchId = String(metadata.branchId ?? '');
    const storagePath = batch.storage_path as string | null;
    if (!entity || !branchId || !storagePath) {
      await service
        .from('data_import_batches')
        .update({
          status: 'failed',
          error_message: 'Lote en cola incompleto (entity/branch/storage)',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);
      results.push({ batchId, error: 'incomplete' });
      continue;
    }

    const storageClient = await createServiceClient();
    const { data: blob, error: downloadError } = await storageClient.storage
      .from('data-migration')
      .download(storagePath);
    if (downloadError || !blob) {
      await service
        .from('data_import_batches')
        .update({
          status: 'failed',
          error_message: downloadError?.message ?? 'download failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);
      results.push({ batchId, error: 'download' });
      continue;
    }

    const csvText = await blob.text();
    const parsed = parseCsv(csvText);
    const mapping = ((batch.column_mapping as Record<string, unknown>)?.[entity] ??
      {}) as Record<string, string | null>;
    const offset = Number(batch.progress_processed ?? 0);
    const range = chunkRange(parsed.rows.length, offset, chunkSize);

    const { data: decisionRows } = await service
      .from('data_import_row_decisions')
      .select('*')
      .eq('batch_id', batchId)
      .eq('entity_type', entity);
    const rowDecisions: Record<number, RowConflictDecision> = {};
    for (const row of (decisionRows ?? []) as Array<Record<string, unknown>>) {
      rowDecisions[Number(row.row_number)] = {
        rowNumber: Number(row.row_number),
        decision: row.decision as ConflictPolicy,
        linkInternalId: (row.link_internal_id as string | null) ?? null,
        externalId: (row.external_id as string | null) ?? null,
      };
    }

    await service
      .from('data_import_batches')
      .update({ status: 'importing', worker_locked_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('status', 'queued')
      .is('cancel_requested_at', null);

    const { data: claimed } = await service
      .from('data_import_batches')
      .select('id, status, cancel_requested_at')
      .eq('id', batchId)
      .maybeSingle();
    if (!claimed || claimed.status !== 'importing' || claimed.cancel_requested_at) {
      results.push({ batchId, skipped: 'claim_lost' });
      continue;
    }

    try {
      let imported = 0;
      let failed = 0;
      let linked = 0;
      let skipped = 0;

      let knownStaffInternalIds: Set<string> | undefined;
      const { data: branchRows } = await service
        .from('branches')
        .select('id')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .limit(5000);
      const knownBranchInternalIds = new Set(
        ((branchRows ?? []) as Array<{ id: string }>).map((b) => b.id).filter(Boolean)
      );
      if (
        entity === 'appointments' ||
        entity === 'consultations' ||
        entity === 'surgeries' ||
        entity === 'hospitalizations' ||
        entity === 'lab_orders' ||
        entity === 'prescriptions' ||
        entity === 'clinical_entries' ||
        entity === 'vaccinations'
      ) {
        const { data: profiles } = await service
          .from('profiles')
          .select('id')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .limit(5000);
        knownStaffInternalIds = new Set(
          ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id).filter(Boolean)
        );
      }

      if (isSpecialtyCheck(entity)) {
        const result = await commitSpecialtySlice({
          supabase: service,
          entity,
          rows: parsed.rows,
          mapping,
          locale: (batch.date_locale as DateLocale) ?? 'es-AR',
          patientIdByExternal: metadata.patientIdByExternal ?? {},
          ownerIdByExternal: metadata.ownerIdByExternal ?? {},
          productIdByExternal: metadata.productIdByExternal ?? {},
          invoiceIdByExternal: metadata.invoiceIdByExternal ?? {},
          appointmentIdByExternal: metadata.appointmentIdByExternal ?? {},
          branchIdByExternal: metadata.branchIdByExternal ?? {},
          userIdByExternal: metadata.userIdByExternal ?? {},
          knownStaffInternalIds,
          knownBranchInternalIds,
          organizationId,
          branchId,
          batchId,
          userId: String(batch.created_by ?? organizationId),
          sourceSystem: (batch.source_system as string | null) ?? null,
          idempotencyMode: (batch.idempotency_mode as IdempotencyMode) ?? 'off',
          offset: range.offset,
          limit: range.size,
        });
        imported = result.imported;
        failed = result.failed;
        skipped = result.skipped;
      } else {
        const result = await commitCoreEntitySlice({
          organizationId,
          userId: (batch.created_by as string | null) ?? null,
          batchId,
          entity,
          mapping,
          sourceSystem: (batch.source_system as string | null) ?? null,
          idempotencyMode: (batch.idempotency_mode as IdempotencyMode) ?? 'off',
          ownerIdByExternal: metadata.ownerIdByExternal ?? {},
          patientIdByExternal: metadata.patientIdByExternal ?? {},
          branchIdByExternal: metadata.branchIdByExternal ?? {},
          userIdByExternal: metadata.userIdByExternal ?? {},
          knownStaffInternalIds,
          knownBranchInternalIds,
          branchId,
          offset: range.offset,
          limit: range.size,
          totalRows: parsed.rows.length,
          rows: parsed.rows,
          rowDecisions,
          dateLocale: (batch.date_locale as string | undefined) ?? undefined,
        });
        imported = result.imported;
        failed = result.failed;
        linked = result.linked;
        skipped = result.skipped;
      }

      const totalImported = Number(batch.imported_records ?? 0) + imported;
      const totalFailed = Number(batch.failed_records ?? 0) + failed;
      const totalLinked = Number(batch.linked_records ?? 0) + linked;
      const totalSkipped = Number(batch.skipped_records ?? 0) + skipped;
      const status = range.done
        ? totalFailed > 0 && totalImported + totalLinked > 0
          ? 'completed_with_warnings'
          : totalFailed > 0 && totalImported + totalLinked === 0
            ? 'failed'
            : 'completed'
        : 'queued';

      await service
        .from('data_import_batches')
        .update({
          status,
          progress_processed: range.end,
          progress_total: parsed.rows.length,
          progress_message: `${entity}: ${range.end}/${parsed.rows.length}`,
          imported_records: totalImported,
          failed_records: totalFailed,
          linked_records: totalLinked,
          skipped_records: totalSkipped,
          completed_at: range.done ? new Date().toISOString() : null,
          worker_locked_at: null,
          worker_lock_token: null,
        })
        .eq('id', batchId);

      if (range.done) {
        const { notifyDataMigrationEvent } = await import('@/lib/data-migration/notify');
        await notifyDataMigrationEvent({
          organizationId,
          title:
            status === 'failed'
              ? 'Importación fallida'
              : status === 'completed_with_warnings'
                ? 'Importación completada con avisos'
                : 'Importación completada',
          body: `${entity}: ${totalImported} importados · ${totalFailed} fallidos · ${totalSkipped} omitidos`,
          relatedType: 'data_import_batch',
          relatedId: batchId,
        });
      }

      results.push({
        batchId,
        processed: range.end,
        total: parsed.rows.length,
        done: range.done,
        status,
      });
    } catch (err) {
      await service
        .from('data_import_batches')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'worker failed',
          completed_at: new Date().toISOString(),
          worker_locked_at: null,
        })
        .eq('id', batchId);
      const { notifyDataMigrationEvent } = await import('@/lib/data-migration/notify');
      await notifyDataMigrationEvent({
        organizationId,
        title: 'Importación fallida',
        body: err instanceof Error ? err.message : 'Error en el worker de importación',
        relatedType: 'data_import_batch',
        relatedId: batchId,
      });
      results.push({
        batchId,
        error: err instanceof Error ? err.message : 'worker_failed',
      });
    }
  }

  return { processedBatches: results.length, results };
}
