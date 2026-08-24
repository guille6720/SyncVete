import { notFound, redirect } from 'next/navigation';
import { getSuperadminOrgDataMigrationStats } from '@/actions/data-migration';
import { SuperadminOrgDataMigrationCard } from '@/components/superadmin/org-data-migration-card';
import {
  getSuperadminOrgCommercial,
  listSuperadminBillingEvents,
  listSuperadminCheckoutIntents,
  listSuperadminRecommendationAssignees,
} from '@/actions/superadmin';
import { SuperadminOrgDetail } from '@/components/superadmin/org-detail';
import { SuperadminPlanRecommendationPanel } from '@/components/superadmin/plan-recommendation-panel';
import { getSessionContext } from '@/lib/session';
import {
  getPlanRecommendationForOrganization,
  getPlanRecommendationCommercialMeta,
  listPlanRecommendationHistory,
} from '@/lib/plan-recommendations';
import { SuperadminRecommendationHistory } from '@/components/superadmin/recommendation-history';
import { formatMeteredUsage } from '@sincvete/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SuperadminOrganizationPage({ params }: PageProps) {
  const [session, { id }] = await Promise.all([getSessionContext(), params]);
  if (!session?.isPlatformAdmin) redirect('/dashboard');

  try {
    const [
      data,
      events,
      checkoutIntents,
      recommendationBundle,
      recommendationHistory,
      commercialMeta,
      assignees,
      migrationStatsResult,
    ] = await Promise.all([
      getSuperadminOrgCommercial(id),
      listSuperadminBillingEvents(id),
      listSuperadminCheckoutIntents(id),
      getPlanRecommendationForOrganization(id).catch(() => null),
      listPlanRecommendationHistory(id).catch(() => []),
      getPlanRecommendationCommercialMeta(id).catch(() => null),
      listSuperadminRecommendationAssignees().catch(() => []),
      getSuperadminOrgDataMigrationStats(id).catch(() => null),
    ]);

    const migrationStats =
      migrationStatsResult && migrationStatsResult.success ? migrationStatsResult.data : null;

    return (
      <div className="space-y-6">
        {recommendationBundle ? (
          <SuperadminPlanRecommendationPanel
            organizationId={id}
            organizationName={data.organization.name}
            recommendation={recommendationBundle.recommendation}
            comparison={recommendationBundle.comparison}
            commercialMeta={commercialMeta}
            assignees={assignees}
            currentUserId={session.userId}
          />
        ) : null}

        <SuperadminRecommendationHistory events={recommendationHistory} />

        <Card id="recomendacion-uso">
          <CardHeader>
            <CardTitle>Uso comercial</CardTitle>
            <CardDescription>
              Cupos y metros frente al entitlement efectivo (plan / override / addon).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            {[...data.seats, ...data.meters].map((meter) => {
              const resolved = data.entitlements[meter.featureKey];
              return (
                <div key={meter.featureKey} className="flex items-center justify-between gap-2 border-b py-1">
                  <span>{meter.label}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatMeteredUsage(meter)}
                    {resolved ? <Badge variant="default">{resolved.source}</Badge> : null}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <SuperadminOrgDataMigrationCard stats={migrationStats ?? null} />

        <div id="suscripcion">
          <SuperadminOrgDetail data={data} events={events} checkoutIntents={checkoutIntents} />
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
