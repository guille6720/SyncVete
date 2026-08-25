'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { updateVaccination } from '@/actions/vaccinations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  SPECIES_EMOJI,
  VACCINATION_DUE_STATUS_LABELS,
  VACCINATION_DUE_STATUS_VARIANT,
  VACCINATION_ROUTES,
  VACCINATION_ROUTE_LABELS,
  formatVaccinationDate,
  vaccinationDueStatus,
  type VaccinationListRow,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface VaccinationDetailProps {
  vaccination: VaccinationListRow;
  canWrite: boolean;
  settlementClaim?: SettlementSourceClaimInfo | null;
  settlementDetailBasePath?: string;
}

export function VaccinationDetail({
  vaccination,
  canWrite,
  settlementClaim = null,
  settlementDetailBasePath = '/liquidaciones',
}: VaccinationDetailProps) {
  const dueStatus = vaccinationDueStatus(vaccination.next_due_at);
  const action = updateVaccination.bind(null, vaccination.id);
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/vacunacion">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a vacunación
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {vaccination.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${vaccination.clinical_entry_id}`}>Ver en historia</Link>
            </Button>
          )}
          {vaccination.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${vaccination.consultation_id}`}>Ver consulta</Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/vacunacion/nueva?patientId=${vaccination.patient_id}`}>
                Nueva dosis
              </Link>
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
            <CardTitle>{vaccination.vaccine_name}</CardTitle>
            <Badge variant={VACCINATION_DUE_STATUS_VARIANT[dueStatus]}>
              {VACCINATION_DUE_STATUS_LABELS[dueStatus]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Paciente"
            value={
              <Link
                href={`/pacientes/${vaccination.patient_id}`}
                className="text-primary hover:underline"
              >
                {SPECIES_EMOJI[vaccination.patient_species]} {vaccination.patient_name}
              </Link>
            }
          />
          <DetailField
            label="Propietario"
            value={
              <Link
                href={`/propietarios/${vaccination.owner_id}`}
                className="text-primary hover:underline"
              >
                {vaccination.owner_full_name}
              </Link>
            }
          />
          <DetailField label="Aplicada" value={formatVaccinationDate(vaccination.administered_at)} />
          <DetailField
            label="Próximo refuerzo"
            value={formatVaccinationDate(vaccination.next_due_at)}
          />
          <DetailField label="Laboratorio" value={vaccination.manufacturer} />
          <DetailField label="Lote" value={vaccination.lot_number} />
          <DetailField
            label="Vía"
            value={vaccination.route ? VACCINATION_ROUTE_LABELS[vaccination.route] : null}
          />
          <DetailField label="Veterinario" value={vaccination.veterinarian_name} />
          {vaccination.notes && (
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={vaccination.notes} />
            </div>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Actualizar datos</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid max-w-2xl gap-4">
              <input type="hidden" name="administeredAt" value={vaccination.administered_at} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Laboratorio</Label>
                  <Input
                    id="manufacturer"
                    name="manufacturer"
                    defaultValue={vaccination.manufacturer ?? ''}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lotNumber">Lote</Label>
                  <Input
                    id="lotNumber"
                    name="lotNumber"
                    defaultValue={vaccination.lot_number ?? ''}
                    maxLength={80}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nextDueAt">Próximo refuerzo</Label>
                  <Input
                    id="nextDueAt"
                    name="nextDueAt"
                    type="date"
                    defaultValue={vaccination.next_due_at ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route">Vía</Label>
                  <Select id="route" name="route" defaultValue={vaccination.route ?? ''}>
                    <option value="">—</option>
                    {VACCINATION_ROUTES.map((route) => (
                      <option key={route} value={route}>
                        {VACCINATION_ROUTE_LABELS[route]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={vaccination.notes ?? ''} />
              </div>
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              {state?.success && <p className="text-sm text-muted-foreground">Cambios guardados.</p>}
              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Guardando...' : 'Guardar'}
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
