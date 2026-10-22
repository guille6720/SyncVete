import { ClinicBillingBanner } from '@/components/entitlements/clinic-billing-banner';
import { getClinicCommercialBanner } from '@/lib/entitlements';

/**
 * Non-critical commercial banner. Loaded outside the layout critical path via Suspense
 * so entitled hrefs + module children are not blocked by checkout/meter queries.
 */
export async function ClinicBillingBannerSlot({ organizationId }: { organizationId: string }) {
  const banner = await getClinicCommercialBanner(organizationId);
  if (!banner) return null;
  return <ClinicBillingBanner banner={banner} />;
}
