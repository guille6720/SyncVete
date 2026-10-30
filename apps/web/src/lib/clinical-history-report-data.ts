import { createServerClient } from '@/lib/supabase/server';
import { requirePermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
import { CLINICAL_ENTRY_COLUMNS } from '@/lib/db-columns';
import {
  clinicalDayRange,
  historyExportSchema,
  type ClinicalHistoryReport,
} from './clinical-history-report';
import type { ClinicalEntry } from '@sincvete/shared';

export class HistoryReportError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Uses the caller's session and RLS; never a service/admin client. */
export async function loadClinicalHistoryReport(input: {
  patientId: string;
  date?: string;
}): Promise<ClinicalHistoryReport> {
  const parsed = historyExportSchema.parse(input);
  const session = await requirePermissionAndFeature('clinical:read', FEATURES.CLINICAL_HISTORY);
  if (session.kind !== 'staff') throw new HistoryReportError('Acceso no permitido', 403);
  const db = await createServerClient();
  const { data: memberships, error: membershipError } = await db
    .from('branch_members')
    .select('branch_id')
    .eq('organization_id', session.organizationId)
    .eq('user_id', session.userId)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (membershipError) throw new HistoryReportError('No se pudieron verificar las sucursales', 500);
  const branchIds = [...new Set((memberships ?? []).map((row) => row.branch_id))];
  if (!branchIds.length) throw new HistoryReportError('No tenés sucursales disponibles', 403);

  const { data: patient, error: patientError } = await db
    .from('patients')
    .select('id,name,species,breed,sex,birth_date,microchip,owner_id,branch_id')
    .eq('organization_id', session.organizationId)
    .eq('id', parsed.patientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (patientError) throw new HistoryReportError('No se pudo consultar el paciente', 500);
  if (!patient || (patient.branch_id && !branchIds.includes(patient.branch_id))) {
    throw new HistoryReportError('Paciente no disponible', 404);
  }
  const generatedAt = new Date().toISOString();
  const range = parsed.date ? clinicalDayRange(parsed.date) : null;
  const entries: ClinicalEntry[] = [];
  const pageSize = 500;
  for (let offset = 0; ;) {
    let query = db
      .from('clinical_entries')
      .select(CLINICAL_ENTRY_COLUMNS)
      .eq('organization_id', session.organizationId)
      .eq('patient_id', parsed.patientId)
      .in('branch_id', branchIds)
      .is('deleted_at', null)
      .lte('created_at', generatedAt)
      .order('entry_date', { ascending: true })
      .order('id', { ascending: true });
    if (range) query = query.gte('entry_date', range.from).lt('entry_date', range.to);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new HistoryReportError('No se pudo cargar la historia completa', 500);
    if (!data?.length) break;
    entries.push(...(data as ClinicalEntry[]));
    offset += data.length;
  }
  const profileIds = [
    ...new Set(entries.map((e) => e.recorded_by).filter((id): id is string => !!id)),
  ];
  const [ownerResult, clinicResult, branchResult, profileResult] = await Promise.all([
    db
      .from('owners')
      .select('full_name')
      .eq('organization_id', session.organizationId)
      .eq('id', patient.owner_id)
      .is('deleted_at', null)
      .maybeSingle(),
    db.from('organizations').select('name').eq('id', session.organizationId).maybeSingle(),
    db
      .from('branches')
      .select('id,name')
      .eq('organization_id', session.organizationId)
      .in('id', branchIds),
    profileIds.length
      ? db
          .from('profiles')
          .select('id,full_name')
          .eq('organization_id', session.organizationId)
          .in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ownerResult.error || clinicResult.error || branchResult.error || profileResult.error) {
    throw new HistoryReportError('No se pudieron completar los datos del informe', 500);
  }
  const branchNames = new Map((branchResult.data ?? []).map((b) => [b.id, b.name]));
  const profileNames = new Map((profileResult.data ?? []).map((p) => [p.id, p.full_name]));
  return {
    clinicName: clinicResult.data?.name ?? 'Veterinaria',
    patient,
    ownerName: ownerResult.data?.full_name ?? 'No disponible',
    date: parsed.date,
    generatedAt,
    entries: entries.map((entry) => ({
      ...entry,
      professionalName: entry.recorded_by ? (profileNames.get(entry.recorded_by) ?? null) : null,
      branchName: branchNames.get(entry.branch_id) ?? null,
    })),
  };
}
