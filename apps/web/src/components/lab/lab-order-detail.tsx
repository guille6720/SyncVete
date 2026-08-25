'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import {
  cancelLabOrder,
  completeLabOrderAction,
  saveLabResults,
  startLabOrder,
} from '@/actions/lab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  LAB_ORDER_STATUS_LABELS,
  LAB_ORDER_STATUS_VARIANT,
  LAB_PRIORITY_LABELS,
  LAB_PRIORITY_VARIANT,
  LAB_RESULT_FLAGS,
  LAB_RESULT_FLAG_LABELS,
  LAB_RESULT_FLAG_VARIANT,
  LAB_SAMPLE_TYPE_LABELS,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  buildWhatsAppComposePath,
  type LabOrderItem,
  type LabOrderListRow,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface LabOrderDetailProps {
  order: LabOrderListRow;
  items: LabOrderItem[];
  canWrite: boolean;
  canSendWhatsApp?: boolean;
  settlementClaim?: SettlementSourceClaimInfo | null;
  settlementDetailBasePath?: string;
}

export function LabOrderDetail({
  order,
  items,
  canWrite,
  canSendWhatsApp = false,
  settlementClaim = null,
  settlementDetailBasePath = '/liquidaciones',
}: LabOrderDetailProps) {
  const router = useRouter();
  const isOpen = order.status === 'solicitada' || order.status === 'en_proceso';
  const canOperate = canWrite && isOpen;

  const saveAction = saveLabResults.bind(null, order.id);
  const completeAction = completeLabOrderAction.bind(null, order.id);
  const [saveState, saveFormAction, savePending] = useActionState(saveAction, null);
  const [completeState, completeFormAction, completePending] = useActionState(completeAction, null);

  const pending = savePending || completePending;
  const state = completeState ?? saveState;

  const handleStart = async () => {
    const result = await startLabOrder(order.id);
    if (result.success) router.refresh();
  };

  const handleCancel = async () => {
    if (!confirm('¿Cancelar esta orden de laboratorio?')) return;
    const result = await cancelLabOrder(order.id);
    if (result.success) router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/laboratorio">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a laboratorio
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canSendWhatsApp && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildWhatsAppComposePath({
                  ownerId: order.owner_id,
                  patientId: order.patient_id,
                  labOrderId: order.id,
                  template: 'lab_listo',
                })}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          )}
          {order.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${order.clinical_entry_id}`}>Ver en historia</Link>
            </Button>
          )}
          {order.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${order.consultation_id}`}>Ver consulta</Link>
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
              {SPECIES_EMOJI[order.patient_species]} {order.patient_name}
            </CardTitle>
            <Badge variant={LAB_ORDER_STATUS_VARIANT[order.status]}>
              {LAB_ORDER_STATUS_LABELS[order.status]}
            </Badge>
            <Badge variant={LAB_PRIORITY_VARIANT[order.priority]}>
              {LAB_PRIORITY_LABELS[order.priority]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {order.title}
            {' · '}
            {formatClinicalEntryDateTime(order.ordered_at)}
            {order.ordered_by_name ? ` · ${order.ordered_by_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Paciente"
            value={
              <Link href={`/pacientes/${order.patient_id}`} className="text-primary hover:underline">
                {order.patient_name}
              </Link>
            }
          />
          <DetailField
            label="Propietario"
            value={
              <Link href={`/propietarios/${order.owner_id}`} className="text-primary hover:underline">
                {order.owner_full_name}
              </Link>
            }
          />
          <DetailField
            label="Muestra"
            value={order.sample_type ? LAB_SAMPLE_TYPE_LABELS[order.sample_type] : null}
          />
          <DetailField
            label="Completada"
            value={order.completed_at ? formatClinicalEntryDateTime(order.completed_at) : null}
          />
          {!canOperate && (
            <>
              <div className="sm:col-span-2">
                <DetailField label="Interpretación" value={order.interpretation} />
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Notas" value={order.notes} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Resultados</p>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.test_name}</span>
                        <Badge variant={LAB_RESULT_FLAG_VARIANT[item.flag]}>
                          {LAB_RESULT_FLAG_LABELS[item.flag]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {[item.result_value, item.unit].filter(Boolean).join(' ') || '—'}
                        {item.reference_range ? ` · Ref: ${item.reference_range}` : ''}
                      </p>
                      {item.notes && <p className="mt-1 whitespace-pre-wrap">{item.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canOperate && (
        <Card>
          <CardHeader>
            <CardTitle>Carga de resultados</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid max-w-4xl gap-4">
              {items.map((item, index) => (
                <div key={item.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="sm:col-span-2">
                    <p className="font-medium">{item.test_name}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`resultValue_${index}`}>Resultado</Label>
                    <Input
                      id={`resultValue_${index}`}
                      name={`resultValue_${index}`}
                      defaultValue={item.result_value ?? ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`unit_${index}`}>Unidad</Label>
                    <Input
                      id={`unit_${index}`}
                      name={`unit_${index}`}
                      defaultValue={item.unit ?? ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`referenceRange_${index}`}>Rango de referencia</Label>
                    <Input
                      id={`referenceRange_${index}`}
                      name={`referenceRange_${index}`}
                      defaultValue={item.reference_range ?? ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`flag_${index}`}>Flag</Label>
                    <Select
                      id={`flag_${index}`}
                      name={`flag_${index}`}
                      defaultValue={item.flag}
                    >
                      {LAB_RESULT_FLAGS.map((flag) => (
                        <option key={flag} value={flag}>
                          {LAB_RESULT_FLAG_LABELS[flag]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`itemNotes_${index}`}>Notas del estudio</Label>
                    <Input
                      id={`itemNotes_${index}`}
                      name={`itemNotes_${index}`}
                      defaultValue={item.notes ?? ''}
                    />
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <Label htmlFor="interpretation">Interpretación</Label>
                <Textarea
                  id="interpretation"
                  name="interpretation"
                  rows={3}
                  defaultValue={order.interpretation ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={order.notes ?? ''} />
              </div>

              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              {saveState?.success && !completeState && (
                <p className="text-sm text-muted-foreground">Resultados guardados.</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button formAction={saveFormAction} variant="outline" disabled={pending}>
                  {savePending ? 'Guardando...' : 'Guardar'}
                </Button>
                {order.status === 'solicitada' && (
                  <Button type="button" disabled={pending} onClick={handleStart}>
                    Iniciar proceso
                  </Button>
                )}
                <Button formAction={completeFormAction} disabled={pending}>
                  {completePending ? 'Cerrando...' : 'Completar y escribir historia'}
                </Button>
                <Button type="button" variant="destructive" disabled={pending} onClick={handleCancel}>
                  Cancelar orden
                </Button>
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
