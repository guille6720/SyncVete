import { FEATURES } from '@sincvete/shared';
import { FeatureModuleLayout } from '@/components/entitlements/feature-module-layout';

export default function InterconsultasLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureModuleLayout feature={FEATURES.PROFESSIONALS_INTERCONSULTATIONS} title="Interconsultas">
      {children}
    </FeatureModuleLayout>
  );
}
