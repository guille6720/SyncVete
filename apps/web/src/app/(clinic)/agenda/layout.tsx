import { FEATURES } from '@sincvete/shared';
import { FeatureModuleLayout } from '@/components/entitlements/feature-module-layout';

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureModuleLayout feature={FEATURES.APPOINTMENTS} title="Agenda">
      {children}
    </FeatureModuleLayout>
  );
}
