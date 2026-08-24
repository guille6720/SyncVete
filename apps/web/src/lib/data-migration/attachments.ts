import 'server-only';

import {
  CLINICAL_IMAGE_MAX_BYTES,
  DEFAULT_IMPORT_CHUNK_SIZE,
  FEATURES,
  MAX_IMPORT_ZIP_BYTES,
  buildAttachmentMetaKey,
  buildClinicalImageStoragePath,
  bytesToStorageMb,
  chunkRange,
  guessMimeFromFilename,
  isAllowedClinicalImageMime,
  parseAttachmentMetaCsv,
  parseMigrationAttachmentPath,
  resolveImportBranchId,
  resolveImportStaffUserId,
  type AttachmentMetaRow,
  type ClinicalImageKind,
} from '@sincvete/shared';
import JSZip from 'jszip';
import { createServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/permissions';
import { canUseFeature, consumeMeteredFeature, getMeteredUsageMeters } from '@/lib/entitlements';
import { migrationDb } from '@/lib/data-migration/db';

function kindFromMime(mime: string): ClinicalImageKind {
  if (mime === 'application/pdf') return 'documento';
  return 'foto';
}

function findAttachmentMetaCsvPath(filePaths: string[]): string | null {
  for (const path of filePaths) {
    const normalized = path.replace(/\\/g, '/');
    if (!normalized.endsWith('attachments_meta.csv')) continue;
    if (normalized.split('/').includes('attachments')) continue;
    return path;
  }
  return null;
}

async function loadAttachmentMetaMap(
  zip: JSZip
): Promise<Map<string, AttachmentMetaRow>> {
  const metaPath = findAttachmentMetaCsvPath(Object.keys(zip.files));
  if (!metaPath) return new Map();
  const entry = zip.file(metaPath);
  if (!entry) return new Map();
  const csvText = await entry.async('string');
  const { rows } = parseAttachmentMetaCsv(csvText);
  const metaMap = new Map<string, AttachmentMetaRow>();
  for (const row of rows) {
    metaMap.set(buildAttachmentMetaKey(row.externalPatientId, row.filename), row);
  }
  return metaMap;
}

export async function importZipAttachmentsChunk(input: {
  batchId: string;
  zipBuffer: ArrayBuffer;
  patientIdByExternal: Record<string, string>;
  branchId: string;
  branchIdByExternal?: Record<string, string>;
  userIdByExternal?: Record<string, string>;
  sourceSystem?: string | null;
  offset?: number;
  chunkSize?: number;
}) {
  const session = await requirePermission('data:import');
  if (input.zipBuffer.byteLength > MAX_IMPORT_ZIP_BYTES) {
    throw new Error(
      `El ZIP supera el máximo permitido (${Math.round(MAX_IMPORT_ZIP_BYTES / (1024 * 1024))} MB)`
    );
  }
  const imagesOk = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.CLINICAL_IMAGES,
  });
  if (!imagesOk) {
    throw new Error('Imágenes clínicas no habilitadas en el plan de la clínica');
  }

  const supabase = await migrationDb();
  const storage = await createServerClient();
  const { data: batch } = await supabase
    .from('data_import_batches')
    .select('id, organization_id, imported_records, failed_records')
    .eq('id', input.batchId)
    .eq('organization_id', session.organizationId)
    .single();
  if (!batch) throw new Error('Lote no encontrado');

  const zip = await JSZip.loadAsync(input.zipBuffer);
  const refs = Object.keys(zip.files)
    .map((path) => parseMigrationAttachmentPath(path))
    .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));

  const metaMap = await loadAttachmentMetaMap(zip);
  let knownBranchInternalIds: Set<string> | undefined;
  let knownStaffInternalIds: Set<string> | undefined;
  if (metaMap.size > 0) {
    const { data: branchRows } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .limit(5000);
    knownBranchInternalIds = new Set(
      ((branchRows ?? []) as Array<{ id: string }>).map((b) => b.id).filter(Boolean)
    );
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .limit(5000);
    knownStaffInternalIds = new Set(
      ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id).filter(Boolean)
    );
  }

  const range = chunkRange(
    refs.length,
    input.offset ?? 0,
    input.chunkSize ?? DEFAULT_IMPORT_CHUNK_SIZE
  );
  const slice = refs.slice(range.offset, range.end);

  if (range.offset === 0 && refs.length > 0) {
    let estimatedBytes = 0;
    for (const ref of refs) {
      const entry = zip.file(ref.zipPath);
      if (!entry) continue;
      const raw = entry as unknown as { _data?: { uncompressedSize?: number } };
      const declared = Number(raw._data?.uncompressedSize ?? 0);
      if (declared > 0) {
        estimatedBytes += declared;
        continue;
      }
      const bytes = await entry.async('uint8array');
      estimatedBytes += bytes.byteLength;
    }
    const meters = await getMeteredUsageMeters(session.organizationId);
    const storage = meters.find((m) => m.featureKey === FEATURES.STORAGE_MAX_MB);
    if (storage && storage.limit !== null) {
      const neededMb = bytesToStorageMb(estimatedBytes);
      const remaining = Math.max(0, storage.limit - storage.used);
      if (neededMb > remaining) {
        throw new Error(
          `Storage insuficiente: el ZIP necesita ~${neededMb} MB y quedan ${remaining} MB del plan`
        );
      }
    }
  }

  await supabase
    .from('data_import_batches')
    .update({
      status: 'importing',
      progress_total: refs.length,
      progress_processed: range.offset,
      progress_message: `Adjuntos ${range.offset}/${refs.length}`,
      chunk_size: input.chunkSize ?? DEFAULT_IMPORT_CHUNK_SIZE,
      started_at: new Date().toISOString(),
    })
    .eq('id', input.batchId);

  let imported = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const ref of slice) {
    const patientId = input.patientIdByExternal[ref.externalPatientId];
    if (!patientId) {
      failed += 1;
      continue;
    }
    const mime = guessMimeFromFilename(ref.filename);
    if (!mime || !isAllowedClinicalImageMime(mime)) {
      failed += 1;
      continue;
    }

    const entry = zip.file(ref.zipPath);
    if (!entry) {
      failed += 1;
      continue;
    }
    const bytes = await entry.async('uint8array');
    if (bytes.byteLength === 0 || bytes.byteLength > CLINICAL_IMAGE_MAX_BYTES) {
      failed += 1;
      continue;
    }

    const { data: patient } = await supabase
      .from('patients')
      .select('id, owner_id')
      .eq('id', patientId)
      .eq('organization_id', session.organizationId)
      .maybeSingle();
    if (!patient) {
      failed += 1;
      continue;
    }

    try {
      await consumeMeteredFeature({
        organizationId: session.organizationId,
        featureKey: FEATURES.STORAGE_MAX_MB,
        amount: bytesToStorageMb(bytes.byteLength),
      });
    } catch {
      failed += 1;
      continue;
    }

    const imageId = crypto.randomUUID();
    const storagePath = buildClinicalImageStoragePath(
      session.organizationId,
      patient.id,
      imageId,
      mime
    );
    if (!storagePath) {
      failed += 1;
      continue;
    }

    let branchId = input.branchId;
    let uploadedBy = session.userId;
    const meta = metaMap.get(buildAttachmentMetaKey(ref.externalPatientId, ref.filename));
    if (meta) {
      const branchResolved = resolveImportBranchId({
        externalBranchId: meta.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      branchId = branchResolved.branchId;

      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: meta.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds,
        defaultUserId: session.userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      uploadedBy = staffResolved.userId ?? session.userId;
    }

    const { error: insertError } = await supabase.from('clinical_images').insert({
      id: imageId,
      organization_id: session.organizationId,
      branch_id: branchId,
      patient_id: patient.id,
      owner_id: patient.owner_id,
      uploaded_by: uploadedBy,
      kind: kindFromMime(mime),
      title: ref.filename.replace(/\.[^.]+$/, '').slice(0, 160) || null,
      notes: `Importado desde ${ref.zipPath}`,
      storage_path: storagePath,
      mime_type: mime,
      file_size: bytes.byteLength,
      original_name: ref.filename.slice(0, 200),
      taken_at: nowIso,
      import_batch_id: input.batchId,
      source_system: input.sourceSystem ?? null,
      source_record_id: ref.zipPath,
      original_created_at: nowIso,
      imported_at: nowIso,
      imported_by: session.userId,
    });
    if (insertError) {
      failed += 1;
      continue;
    }

    const { error: uploadError } = await storage.storage
      .from('clinical-images')
      .upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (uploadError) {
      await supabase
        .from('clinical_images')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', imageId);
      failed += 1;
      continue;
    }

    imported += 1;
    await supabase.from('data_import_created_rows').insert({
      batch_id: input.batchId,
      organization_id: session.organizationId,
      entity_type: 'clinical_images',
      entity_id: imageId,
      external_id: ref.zipPath,
    });
  }

  const processed = range.end;
  const status = range.done
    ? failed > 0 && imported === 0 && Number(batch.imported_records ?? 0) === 0
      ? 'failed'
      : failed > 0
        ? 'completed_with_warnings'
        : 'completed'
    : 'importing';

  await supabase
    .from('data_import_batches')
    .update({
      status,
      progress_processed: processed,
      progress_total: refs.length,
      progress_message: `Adjuntos ${processed}/${refs.length}`,
      imported_records: Number(batch.imported_records ?? 0) + imported,
      failed_records: Number(batch.failed_records ?? 0) + failed,
      completed_at: range.done ? new Date().toISOString() : null,
      summary: {
        attachmentsTotal: refs.length,
        lastChunkImported: imported,
        lastChunkFailed: failed,
        nextOffset: range.nextOffset,
        done: range.done,
      },
    })
    .eq('id', input.batchId);

  return {
    imported,
    failed,
    total: refs.length,
    processed,
    done: range.done,
    nextOffset: range.nextOffset,
    status,
  };
}
