'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  cancelSurgery,
  completeSurgeryAction,
  moveSurgeryToRecovery,
  saveSurgeryWorksheet,
  startSurgery,
} from '@/actions/surgeries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  SPECIES_EMOJI,
  SURGERY_ANESTHESIA_LABELS,
  SURGERY_ANESTHESIA_TYPES,
  SURGERY_ASA_GRADES,
  SURGERY_ASA_LABELS,
  SURGERY_STATUS_LABELS,
  SURGERY_STATUS_VARIANT,
  formatClinicalEntryDateTime,
  type SurgeryListRow,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface SurgeryStayProps {
  surgery: SurgeryListRow;
  canWrite: boolean;
  settlementClaim?: SettlementSourceClaimInfo | null;
  settlementDetailBasePath?: string;
}

export function SurgeryStay({
  surgery,
  canWrite,
  settlementClaim = null,
  settlementDetailBasePath = '/liquidaciones',
}: SurgeryStayProps) {
  const router = useRouter();
  const isOpen =
    surgery.status === 'programada' ||
    surgery.status === 'en_curso' ||
    surgery.status === 'recuperacion';
  const canOperate = canWrite && isOpen;

  const saveAction = saveSurgeryWorksheet.bind(null, surgery.id);
  const completeAction = completeSurgeryAction.bind(null, surgery.id);
  const [saveState, saveFormAction, savePending] = useActionState(saveAction, null);
  const [completeState, completeFormAction, completePending] = useActionState(completeAction, null);

  const pending = savePending || completePending;
  const state = completeState ?? saveState;

  const handleStart = async () => {
    const result = await startSurgery(surgery.id);
    if (result.success) router.refresh();
  };

  const handleRecover = async () => {
    const result = await moveSurgeryToRecovery(surgery.id);
    if (result.success) router.refresh();
  };

  const handleCancel = async () => {
    if (!confirm('¿Cancelar esta cirugía?')) return;
    const result = await cancelSurgery(surgery.id);
    if (result.success) router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cirugias">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a cirugías
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {surgery.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${surgery.clinical_entry_id}`}>Ver en historia</Link>
            </Button>
          )}
          {surgery.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${surgery.consultation_id}`}>Ver consulta</Link>
            </Button>
          )}
          {surgery.appointment_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/agenda/${surgery.appointment_id}`}>Ver cita</Link>
            </Button>
          )}
        </div>
      </div>

      {settlementClaim ? (
        <SettlementSourceBadge
          claim={settlementClaim}
          detailHref={`${settlementDetailBasePath}/${settlementClaim.settlementId}`}
        />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              {SPECIES_EMOJI[surgery.patient_species]} {surgery.patient_name}
            </CardTitle>
            <Badge variant={SURGERY_STATUS_VARIANT[surgery.status]}>
              {SURGERY_STATUS_LABELS[surgery.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {surgery.procedure_name}
            {' · '}
            {formatClinicalEntryDateTime(surgery.scheduled_at)}
            {surgery.surgeon_name ? ` · ${surgery.surgeon_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Paciente"
            value={
              <Link href={`/pacientes/${surgery.patient_id}`} className="text-primary hover:underline">
                {surgery.patient_name}
              </Link>
            }
          />
          <DetailField
            label="Propietario"
            value={
              <Link href={`/propietarios/${surgery.owner_id}`} className="text-primary hover:underline">
                {surgery.owner_full_name}
              </Link>
            }
          />
          {!canOperate && (
            <>
              <DetailField
                label="Anestesia"
                value={surgery.anesthesia ? SURGERY_ANESTHESIA_LABELS[surgery.anesthesia] : null}
              />
              <DetailField
                label="ASA"
                value={surgery.asa ? SURGERY_ASA_LABELS[surgery.asa] : null}
              />
              <div className="sm:col-span-2">
                <DetailField label="Diagnóstico" value={surgery.diagnosis} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Preoperatorio" value={surgery.preop_notes} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Intraoperatorio" value={surgery.intraop_notes} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Postoperatorio" value={surgery.postop_notes} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Complicaciones" value={surgery.complications} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canOperate && (
        <Card>
          <CardHeader>
            <CardTitle>Ficha quirúrgica</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid max-w-3xl gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="anesthesia">Anestesia</Label>
                  <Select id="anesthesia" name="anesthesia" defaultValue={surgery.anesthesia ?? ''}>
                    <option value="">—</option>
                    {SURGERY_ANESTHESIA_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {SURGERY_ANESTHESIA_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asa">ASA</Label>
                  <Select id="asa" name="asa" defaultValue={surgery.asa ?? ''}>
                    <option value="">—</option>
                    {SURGERY_ASA_GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {SURGERY_ASA_LABELS[grade]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <SoapField
                id="diagnosis"
                name="diagnosis"
                label="Diagnóstico"
                defaultValue={surgery.diagnosis ?? ''}
              />
              <SoapField
                id="preopNotes"
                name="preopNotes"
                label="Preoperatorio"
                defaultValue={surgery.preop_notes ?? ''}
              />
              <SoapField
                id="intraopNotes"
                name="intraopNotes"
                label="Intraoperatorio"
                defaultValue={surgery.intraop_notes ?? ''}
              />
              <SoapField
                id="postopNotes"
                name="postopNotes"
                label="Postoperatorio"
                defaultValue={surgery.postop_notes ?? ''}
              />
              <SoapField
                id="complications"
                name="complications"
                label="Complicaciones"
                defaultValue={surgery.complications ?? ''}
                rows={2}
              />
              <SoapField
                id="notes"
                name="notes"
                label="Notas"
                defaultValue={surgery.notes ?? ''}
                rows={2}
              />

              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              {saveState?.success && !completeState && (
                <p className="text-sm text-muted-foreground">Ficha guardada.</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button formAction={saveFormAction} variant="outline" disabled={pending}>
                  {savePending ? 'Guardando...' : 'Guardar'}
                </Button>
                {surgery.status === 'programada' && (
                  <Button type="button" disabled={pending} onClick={handleStart}>
                    Iniciar cirugía
                  </Button>
                )}
                {surgery.status === 'en_curso' && (
                  <Button type="button" variant="outline" disabled={pending} onClick={handleRecover}>
                    Pasar a recuperación
                  </Button>
                )}
                {(surgery.status === 'en_curso' || surgery.status === 'recuperacion') && (
                  <Button formAction={completeFormAction} disabled={pending}>
                    {completePending ? 'Cerrando...' : 'Completar y escribir historia'}
                  </Button>
                )}
                {(surgery.status === 'programada' || surgery.status === 'en_curso') && (
                  <Button type="button" variant="destructive" disabled={pending} onClick={handleCancel}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{value || '—'}</div>
    </div>
  );
}

function SoapField({
  id,
  name,
  label,
  defaultValue,
  rows = 3,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={name} defaultValue={defaultValue} rows={rows} />
    </div>
  );
}
