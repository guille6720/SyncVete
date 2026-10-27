import { FEATURES } from '@sincvete/shared';
import { FeatureModuleLayout } from '@/components/entitlements/feature-module-layout';

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureModuleLayout feature={FEATURES.INVENTORY} title="Compras">
      {children}
    </FeatureModuleLayout>
  );
}
