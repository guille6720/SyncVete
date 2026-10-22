'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveOwnerPortalAccess, revokeOwnerPortalAccess } from '@/actions/portal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface OwnerPortalListActionsProps {
  ownerId: string;
  ownerName: string;
  portalUserId: string | null;
  portalPendingUserId: string | null;
  canWrite: boolean;
}

export function OwnerPortalListActions({
  ownerId,
  ownerName,
  portalUserId,
  portalPendingUserId,
  canWrite,
}: OwnerPortalListActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const needsActivation = Boolean(portalPendingUserId) && !portalUserId;
  const isActive = Boolean(portalUserId);

  if (!needsActivation && !isActive) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const handleApprove = async () => {
    setPending(true);
    setError(null);
    const result = await approveOwnerPortalAccess(ownerId);
    setPending(false);
    if (!result.success) {
      setError(result.error ?? 'No se pudo activar');
      return;
    }
    router.refresh();
  };

  const handleRevoke = async () => {
    setPending(true);
    setError(null);
    const result = await revokeOwnerPortalAccess(ownerId);
    setPending(false);
    setRevokeOpen(false);
    if (!result.success) {
      setError(result.error ?? 'No se pudo revocar');
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex min-w-[10rem] flex-col gap-1.5">
      <ConfirmDialog
        open={revokeOpen}
        title="Revocar acceso a la app"
        description={`¿Revocar el acceso de ${ownerName} a la app del tutor?`}
        confirmLabel="Revocar"
        variant="destructive"
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => {
          void handleRevoke();
        }}
      />
      {needsActivation ? (
        <Badge variant="warning" className="w-fit whitespace-normal text-left">
          Cuenta creada — falta activar
        </Badge>
      ) : (
        <Badge variant="success" className="w-fit">
          App activa
        </Badge>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-1.5">
          {needsActivation && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleApprove();
              }}
            >
              {pending ? 'Activando…' : 'Activar'}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setRevokeOpen(true);
            }}
          >
            Revocar
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
