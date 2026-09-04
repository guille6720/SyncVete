'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Hourglass, MessageCircle, PawPrint, Pencil, Trash2 } from 'lucide-react';
import { deleteOwner } from '@/actions/owners';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DOCUMENT_TYPE_LABELS,
  buildWhatsAppComposePath,
  isClinicPathEntitled,
  type Owner,
  type OwnerPortalStatus,
  type OwnerWaitingRoomHistoryRow,
  type PatientListRow,
} from '@sincvete/shared';
import { OwnerPortalCard } from '@/components/owners/owner-portal-card';
import { OwnerPatientsPanel } from '@/components/owners/owner-patients-panel';
import { OwnerWaitingRoomHistory } from '@/components/owners/owner-waiting-room-history';

interface OwnerDetailProps {
  owner: Owner;
  canWrite: boolean;
  canManagePatients?: boolean;
  canSendWhatsApp?: boolean;
  portalEnabled?: boolean;
  portalStatus: OwnerPortalStatus | null;
  entitledHrefs?: string[] | null;
  waitingRoomHistory?: OwnerWaitingRoomHistoryRow[];
  patients?: PatientListRow[];
  patientsTotal?: number;
}

export function OwnerDetail({
  owner,
  canWrite,
  canManagePatients = false,
  canSendWhatsApp = false,
  portalEnabled = true,
  portalStatus,
  entitledHrefs = null,
  waitingRoomHistory = [],
  patients = [],
  patientsTotal = 0,
}: OwnerDetailProps) {
  const router = useRouter();
  const entitled = (href: string) => isClinicPathEntitled(href, entitledHrefs);
  const queueHref = `/sala-espera?q=${encodeURIComponent(owner.full_name)}`;
  const patientsEnabled = entitled('/pacientes');
  const newPatientHref = `/propietarios/${owner.id}/pacientes/nuevo`;

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este propietario? Esta acción no se puede deshacer.')) return;
    const result = await deleteOwner(owner.id);
    if (result.success) {
      router.push('/propietarios');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/propietarios">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canSendWhatsApp && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildWhatsAppComposePath({ ownerId: owner.id })}>
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          )}
          {entitled('/sala-espera') && waitingRoomHistory.length > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={queueHref}>
                <Hourglass className="mr-2 h-4 w-4" />
                Sala de espera
              </Link>
            </Button>
          )}
          {canManagePatients && patientsEnabled && (
            <Button variant="outline" size="sm" asChild>
              <Link href={newPatientHref}>
                <PawPrint className="mr-2 h-4 w-4" />
                Agregar paciente
              </Link>
            </Button>
          )}
          {canWrite && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/propietarios/${owner.id}/editar`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{owner.full_name}</CardTitle>
            <Badge variant={owner.is_active ? 'success' : 'destructive'}>
              {owner.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Teléfono" value={owner.phone} />
          <DetailField label="WhatsApp" value={owner.phone_whatsapp} />
          <DetailField label="Email" value={owner.email} />
          <DetailField
            label="Documento"
            value={
              owner.document_number
                ? `${DOCUMENT_TYPE_LABELS[owner.document_type]} ${owner.document_number}`
                : null
            }
          />
          <DetailField label="Dirección" value={owner.address} className="sm:col-span-2" />
          <DetailField label="Ciudad" value={owner.city} />
          <DetailField label="Provincia" value={owner.province} />
          <DetailField label="Código postal" value={owner.postal_code} />
          {owner.notes && (
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={owner.notes} />
            </div>
          )}
        </CardContent>
      </Card>

      <OwnerPatientsPanel
        ownerId={owner.id}
        patients={patients}
        total={patientsTotal}
        canWrite={canManagePatients}
        patientsEnabled={patientsEnabled}
      />

      {entitled('/sala-espera') && waitingRoomHistory.length > 0 && (
        <OwnerWaitingRoomHistory history={waitingRoomHistory} ownerName={owner.full_name} />
      )}

      <OwnerPortalCard
        ownerId={owner.id}
        ownerEmail={owner.email}
        canWrite={canWrite}
        portalEnabled={portalEnabled}
        status={portalStatus}
      />
    </div>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value || '—'}</p>
    </div>
  );
}
