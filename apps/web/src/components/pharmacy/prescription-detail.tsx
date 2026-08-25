'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { dispensePrescription, voidPrescription } from '@/actions/pharmacy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  PRESCRIPTION_STATUS_LABELS,
  PRESCRIPTION_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  formatPrescriptionItemLine,
  type PrescriptionItem,
  type PrescriptionListRow,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface PrescriptionDetailProps {
  prescription: PrescriptionListRow;
  items: PrescriptionItem[];
  canWrite: boolean;
  settlementClaim?: SettlementSourceClaimInfo | null;
  settlementDetailBasePath?: string;
  listHref?: string;
}

export function PrescriptionDetail({
  prescription,
  items,
  canWrite,
  settlementClaim = null,
  settlementDetailBasePath = '/liquidaciones',
  listHref = '/farmacia',
}: PrescriptionDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [pending, runPending] = usePendingAction();
  const canOperate = canWrite && prescription.status === 'activa';

  const handleDispense = () => {
    void runPending(async () => {
      setError(null);
      const result = await dispensePrescription(prescription.id);
      if (result.success) router.refresh();
      else setError(result.error ?? 'No se pudo dispensar');
    });
  };

  const handleVoid = () => {
    void runPending(async () => {
      setError(null);
      const result = await voidPrescription(prescription.id, voidReason.trim() || undefined);
      if (result.success) {
        setVoidOpen(false);
        setVoidReason('');
        router.refresh();
      } else {
        setError(result.error ?? 'No se pudo anular');
      }
    });
  };

  return (
    <div className="space-y-4">
      <ModalShell
        open={voidOpen}
        titleId="void-prescription-title"
        title="Anular receta"
        description="No se podrá dispensar. El motivo es opcional."
        onClose={() => {
          if (pending) return;
          setVoidOpen(false);
          setVoidReason('');
        }}
      >
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="voidReason">Motivo</Label>
            <Input
              id="voidReason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setVoidOpen(false);
                setVoidReason('');
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              isPending={pending}
              onClick={handleVoid}
            >
              Anular
            </Button>
          </div>
        </div>
      </ModalShell>
      <ConfirmDialog
        open={Boolean(error)}
        mode="alert"
        title="No se pudo completar"
        description={error ?? ''}
        onClose={() => setError(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={listHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a farmacia
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {prescription.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${prescription.consultation_id}`}>Ver consulta</Link>
            </Button>
          )}
          {prescription.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${prescription.clinical_entry_id}`}>
                Ver en historia
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
            <CardTitle>
              {prescription.number ?? 'Receta'} · {SPECIES_EMOJI[prescription.patient_species]}{' '}
              {prescription.patient_name}
            </CardTitle>
            <Badge variant={PRESCRIPTION_STATUS_VARIANT[prescription.status]}>
              {PRESCRIPTION_STATUS_LABELS[prescription.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(prescription.prescribed_at)}
            {prescription.prescribed_by_name ? ` · ${prescription.prescribed_by_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Paciente"
            value={
              <Link href={`/pacientes/${prescription.patient_id}`} className="text-primary hover:underline">
                {prescription.patient_name}
              </Link>
            }
          />
          <DetailField
            label="Propietario"
            value={
              <Link href={`/propietarios/${prescription.owner_id}`} className="text-primary hover:underline">
                {prescription.owner_full_name}
              </Link>
            }
          />
          <DetailField
            label="Dispensada"
            value={
              prescription.dispensed_at
                ? formatClinicalEntryDateTime(prescription.dispensed_at)
                : null
            }
          />
          <DetailField
            label="Anulada"
            value={
              prescription.voided_at
                ? formatClinicalEntryDateTime(prescription.voided_at)
                : null
            }
          />
          {prescription.void_reason && (
            <div className="sm:col-span-2">
              <DetailField label="Motivo de anulación" value={prescription.void_reason} />
            </div>
          )}
          <div className="sm:col-span-2">
            <DetailField label="Notas" value={prescription.notes} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Medicamentos</p>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{formatPrescriptionItemLine(item)}</p>
                  <p className="mt-1 text-muted-foreground">
                    {item.quantity > 0
                      ? `Dispensar ${item.quantity}`
                      : 'Sin descuento de stock'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {canOperate && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleDispense} isPending={pending}>
            {pending ? 'Dispensando...' : 'Dispensar'}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => setVoidOpen(true)}
          >
            Anular
          </Button>
        </div>
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
