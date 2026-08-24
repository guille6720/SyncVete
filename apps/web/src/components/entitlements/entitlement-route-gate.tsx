'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { getNavFeatureKey, isClinicPathEntitled } from '@sincvete/shared';
import { FeatureUnavailableNotice } from '@/components/entitlements/feature-gate';
import { recordCommercialFeatureSignal } from '@/actions/superadmin';

export function EntitlementRouteGate({
  entitledHrefs,
  children,
}: {
  entitledHrefs: string[] | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const entitled = isClinicPathEntitled(pathname, entitledHrefs);
  const featureKey = getNavFeatureKey(pathname);

  useEffect(() => {
    if (entitled || !featureKey) return;
    void recordCommercialFeatureSignal(featureKey);
  }, [entitled, featureKey, pathname]);

  if (entitled) {
    return <>{children}</>;
  }

  return (
    <FeatureUnavailableNotice
      title="Este módulo no está en tu plan"
      description="Podés seguir usando el resto de la clínica. Para habilitarlo, actualizá el plan."
    />
  );
}
