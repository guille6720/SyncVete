import { FEATURES } from '@sincvete/shared';
import { FeatureModuleLayout } from '@/components/entitlements/feature-module-layout';

export default function SalaEsperaLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureModuleLayout feature={FEATURES.WAITING_ROOM} title="Sala de espera">
      {children}
    </FeatureModuleLayout>
  );
}
