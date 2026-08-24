import { redirect } from 'next/navigation';
import { getSuperadminDataMigrationOpsQueue, getSuperadminDataMigrationWorkerStatus } from '@/actions/data-migration';
import { SuperadminDataMigrationOpsQueue } from '@/components/superadmin/data-migration-ops-queue';
import {
  getSuperadminCommercialSummary,
  listSuperadminAddonsEndingSoon,
  listSuperadminOpenCheckoutIntents,
  listSuperadminOrganizationsRecommended,
  listSuperadminOrgsOverSeats,
  listSuperadminPlansEndingSoon,
  listSuperadminUnappliedBillingEvents,
  listSuperadminUpgradeQueue,
  listSuperadminRecommendationFollowUps,
  listSuperadminRecommendationOutcomes,
  listSuperadminRecommendationStale,
  getSuperadminRecommendationDigest,
  getSuperadminRecommendationFunnel,
  getSuperadminRecommendationTrends,
  getSuperadminRecommendationAssigneeScorecard,
  getSuperadminRecommendationAssigneeWorkload,
  getSuperadminRecommendationAging,
  listSuperadminRecommendationAging,
  getSuperadminRecommendationTagScorecard,
  listSuperadminRecommendationActivity,
  listSuperadminRecommendationTagCatalog,
  listSuperadminRecommendationByTag,
  searchSuperadminRecommendationNotes,
  listSuperadminOpenRecommendationPipeline,
  listSuperadminRecommendationPriorityQueue,
  listSuperadminRecommendationCommercialSnoozed,
  getSuperadminRecommendationSettings,
  listSuperadminRecommendationAssignees,
  listSuperadminRecommendationSavedViews,
} from '@/actions/superadmin';
import { SuperadminOrgList, RecommendationSummaryCards } from '@/components/superadmin/org-list';
import { SuperadminCommercialOps } from '@/components/superadmin/commercial-ops';
import { SuperadminCommercialQueues } from '@/components/superadmin/commercial-queues';
import { SuperadminUpgradeQueue } from '@/components/superadmin/upgrade-queue';
import { SuperadminFollowUpQueue } from '@/components/superadmin/follow-up-queue';
import { SuperadminOutcomeQueue } from '@/components/superadmin/outcome-queue';
import { SuperadminStaleQueue } from '@/components/superadmin/stale-queue';
import { SuperadminRecommendationDigest } from '@/components/superadmin/recommendation-digest';
import { SuperadminRecommendationFunnel } from '@/components/superadmin/recommendation-funnel';
import { SuperadminRecommendationTrends } from '@/components/superadmin/recommendation-trends';
import { SuperadminRecommendationAssigneeScorecard } from '@/components/superadmin/recommendation-assignee-scorecard';
import { SuperadminRecommendationAssigneeWorkload } from '@/components/superadmin/recommendation-assignee-workload';
import { SuperadminRecommendationAging } from '@/components/superadmin/recommendation-aging';
import { SuperadminRecommendationTagScorecard } from '@/components/superadmin/recommendation-tag-scorecard';
import { SuperadminRecommendationActivityFeed } from '@/components/superadmin/recommendation-activity-feed';
import { SuperadminRecommendationTagsBoard } from '@/components/superadmin/recommendation-tags-board';
import { SuperadminRecommendationNoteSearch } from '@/components/superadmin/recommendation-note-search';
import { SuperadminRecommendationOpenPipeline } from '@/components/superadmin/recommendation-open-pipeline';
import { SuperadminRecommendationPriorityQueue } from '@/components/superadmin/recommendation-priority-queue';
import { SuperadminRecommendationCommercialSnoozeBoard } from '@/components/superadmin/recommendation-commercial-snooze';
import { SuperadminRecommendationSavedViews } from '@/components/superadmin/recommendation-saved-views';
import { SuperadminCommercialBulkBoard } from '@/components/superadmin/commercial-bulk-board';
import { SuperadminRecommendationSettingsCard } from '@/components/superadmin/recommendation-settings';
import { getSessionContext } from '@/lib/session';
import type {
  RecommendationAgingBucket,
  RecommendationOpenPipelineSort,
} from '@/lib/plan-recommendations';
import {
  sanitizeCommercialSavedViewParams,
  type CommercialSavedViewParamKey,
} from '@/lib/plan-recommendations/shared';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    plan?: string;
    status?: string;
    recommended?: string;
    upgrade?: string;
    sort?: string;
    assignee?: string;
    outcome?: string;
    digest?: string;
    activity?: string;
    tag?: string;
    aging?: string;
    note?: string;
    pipeline?: string;
    psort?: string;
    priority?: string;
    pfrozen?: string;
    psnooze?: string;
  }>;
}

export default async function SuperadminOrganizationsPage({ searchParams }: PageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session?.isPlatformAdmin) redirect('/dashboard');

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const planKey = params.plan?.trim() ?? '';
  const status = params.status?.trim() ?? '';
  const recommendedPlan = params.recommended?.trim() ?? '';
  const upgradeFilter = params.upgrade?.trim() ?? '';
  const sort = params.sort?.trim() ?? '';
  const assigneeFilter = params.assignee?.trim() ?? '';
  const outcomeFilterRaw = params.outcome?.trim() ?? '';
  const outcomeFilter =
    outcomeFilterRaw === 'won' ||
    outcomeFilterRaw === 'lost' ||
    outcomeFilterRaw === 'deferred' ||
    outcomeFilterRaw === 'not_a_fit'
      ? outcomeFilterRaw
      : null;
  const digestMineOnly = params.digest?.trim() === 'me';
  const activityMineOnly = params.activity?.trim() === 'me';
  const activeTag = params.tag?.trim() || null;
  const agingRaw = params.aging?.trim() ?? '';
  const activeAgingBucket: RecommendationAgingBucket | null =
    agingRaw === '0-7' ||
    agingRaw === '8-14' ||
    agingRaw === '15-30' ||
    agingRaw === '31-plus' ||
    agingRaw === 'unknown'
      ? agingRaw
      : null;
  const noteQuery = params.note?.trim() ?? '';
  const pipelineMineOnly = params.pipeline?.trim() === 'me';
  const psortRaw = params.psort?.trim() ?? '';
  const pipelineSort: RecommendationOpenPipelineSort =
    psortRaw === 'age_asc' ||
    psortRaw === 'severity' ||
    psortRaw === 'name' ||
    psortRaw === 'follow_up' ||
    psortRaw === 'age_desc'
      ? psortRaw
      : 'age_desc';
  const priorityMineOnly = params.priority?.trim() === 'me';
  const priorityIncludeFrozen = params.pfrozen?.trim() === '1';
  const priorityIncludeSnoozed = params.psnooze?.trim() === '1';

  let followUpFilter: { assignedTo?: string | null; unassignedOnly?: boolean } = {};
  if (assigneeFilter === 'unassigned') {
    followUpFilter = { unassignedOnly: true };
  } else if (assigneeFilter === 'me' && session.userId) {
    followUpFilter = { assignedTo: session.userId };
  } else if (assigneeFilter) {
    followUpFilter = { assignedTo: assigneeFilter };
  }

  try {
    const [
      recommended,
      summary,
      checkoutIntents,
      pendingEvents,
      plansEndingSoon,
      addonsEndingSoon,
      orgsOverSeats,
      upgradeQueue,
      followUps,
      outcomes,
      staleRows,
      digest,
      funnel,
      trends,
      assigneeScorecard,
      assigneeWorkload,
      aging,
      agingRows,
      tagScorecard,
      activityEvents,
      tagCatalog,
      taggedOrgs,
      noteHits,
      openPipeline,
      priorityQueue,
      commercialSnoozed,
      assignees,
      recommendationSettings,
      savedViews,
      migrationOpsResult,
      migrationWorkersResult,
    ] = await Promise.all([
      listSuperadminOrganizationsRecommended({
        page,
        pageSize: 25,
        search: search || undefined,
        planKey: planKey || undefined,
        status: status || undefined,
        recommendedPlan: recommendedPlan || undefined,
        upgradeFilter: upgradeFilter || undefined,
        sort: sort || undefined,
      }),
      getSuperadminCommercialSummary(),
      listSuperadminOpenCheckoutIntents(),
      listSuperadminUnappliedBillingEvents(),
      listSuperadminPlansEndingSoon(),
      listSuperadminAddonsEndingSoon(),
      listSuperadminOrgsOverSeats(),
      listSuperadminUpgradeQueue(12).catch(() => ({ rows: [], total: 0 })),
      listSuperadminRecommendationFollowUps(25, followUpFilter).catch(() => []),
      listSuperadminRecommendationOutcomes(25, outcomeFilter).catch(() => []),
      listSuperadminRecommendationStale(25).catch(() => []),
      getSuperadminRecommendationDigest(digestMineOnly).catch(() => null),
      getSuperadminRecommendationFunnel().catch(() => null),
      getSuperadminRecommendationTrends().catch(() => null),
      getSuperadminRecommendationAssigneeScorecard().catch(() => null),
      getSuperadminRecommendationAssigneeWorkload().catch(() => null),
      getSuperadminRecommendationAging().catch(() => null),
      activeAgingBucket
        ? listSuperadminRecommendationAging(activeAgingBucket).catch(() => [])
        : Promise.resolve([]),
      getSuperadminRecommendationTagScorecard().catch(() => null),
      listSuperadminRecommendationActivity(activityMineOnly).catch(() => []),
      listSuperadminRecommendationTagCatalog().catch(() => []),
      activeTag
        ? listSuperadminRecommendationByTag(activeTag).catch(() => [])
        : Promise.resolve([]),
      noteQuery.length >= 2
        ? searchSuperadminRecommendationNotes(noteQuery).catch(() => [])
        : Promise.resolve([]),
      listSuperadminOpenRecommendationPipeline({
        mineOnly: pipelineMineOnly,
        sort: pipelineSort,
      }).catch(() => []),
      listSuperadminRecommendationPriorityQueue({
        mineOnly: priorityMineOnly,
        includeFrozen: priorityIncludeFrozen,
        includeSnoozed: priorityIncludeSnoozed,
      }).catch(() => []),
      listSuperadminRecommendationCommercialSnoozed().catch(() => []),
      listSuperadminRecommendationAssignees().catch(() => []),
      getSuperadminRecommendationSettings().catch(() => null),
      listSuperadminRecommendationSavedViews().catch(() => []),
      getSuperadminDataMigrationOpsQueue(40).catch(() => null),
      getSuperadminDataMigrationWorkerStatus().catch(() => null),
    ]);

    const migrationOps =
      migrationOpsResult && migrationOpsResult.success ? migrationOpsResult.data : null;
    const migrationWorkers = migrationWorkersResult;

    const savedViewCurrentParams = sanitizeCommercialSavedViewParams({
      assignee: assigneeFilter || undefined,
      outcome: outcomeFilterRaw || undefined,
      digest: digestMineOnly ? 'me' : undefined,
      activity: activityMineOnly ? 'me' : undefined,
      tag: activeTag || undefined,
      aging: activeAgingBucket || undefined,
      note: noteQuery || undefined,
      pipeline: pipelineMineOnly ? 'me' : undefined,
      psort: pipelineSort !== 'age_desc' ? pipelineSort : undefined,
      priority: priorityMineOnly ? 'me' : undefined,
      pfrozen: priorityIncludeFrozen ? '1' : undefined,
      psnooze: priorityIncludeSnoozed ? '1' : undefined,
      upgrade: upgradeFilter || undefined,
      recommended: recommendedPlan || undefined,
    } satisfies Partial<Record<CommercialSavedViewParamKey, string | undefined>>);

    const bulkItems = [
      ...upgradeQueue.rows.map((row) => ({
        organizationId: row.id,
        organizationName: row.name,
        detail: `${row.planKey ?? 'sin plan'}${
          row.recommendation.recommendedPlan ? ` → ${row.recommendation.recommendedPlan}` : ''
        }`,
        source: 'upgrade',
      })),
      ...staleRows.map((row) => ({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        detail: `${row.currentPlanKey ?? 'sin plan'}${
          row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''
        }`,
        source: 'stale',
      })),
      ...(digest?.neverContacted ?? []).map((row) => ({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        detail: `${row.currentPlanKey ?? 'sin plan'}${
          row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''
        }`,
        source: 'sin contacto',
      })),
      ...(digest?.overdueFollowUps ?? []).map((row) => ({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        detail: `${row.currentPlanKey ?? 'sin plan'}${
          row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''
        }`,
        source: 'follow-up vencido',
      })),
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizaciones</h1>
          <p className="text-muted-foreground">
            Plan, uso, recomendaciones y pagos. Las recomendaciones no cambian el plan solas.
          </p>
        </div>
        <SuperadminCommercialOps summary={summary} />
        <SuperadminDataMigrationOpsQueue
          queue={migrationOps ?? null}
          workers={migrationWorkers ?? null}
        />
        <SuperadminRecommendationSavedViews
          views={savedViews}
          currentParams={savedViewCurrentParams}
        />
        <SuperadminRecommendationSettingsCard settings={recommendationSettings} />
        <SuperadminRecommendationPriorityQueue
          rows={priorityQueue}
          mineOnly={priorityMineOnly}
          includeFrozen={priorityIncludeFrozen}
          includeSnoozed={priorityIncludeSnoozed}
        />
        <SuperadminRecommendationCommercialSnoozeBoard rows={commercialSnoozed} />
        <SuperadminRecommendationFunnel funnel={funnel} />
        <SuperadminRecommendationTrends trends={trends} />
        <SuperadminRecommendationAging
          aging={aging}
          activeBucket={activeAgingBucket}
          rows={agingRows}
        />
        <SuperadminRecommendationAssigneeScorecard scorecard={assigneeScorecard} />
        <SuperadminRecommendationAssigneeWorkload workload={assigneeWorkload} />
        <SuperadminRecommendationTagScorecard scorecard={tagScorecard} />
        <SuperadminRecommendationActivityFeed
          events={activityEvents}
          mineOnly={activityMineOnly}
        />
        <SuperadminRecommendationTagsBoard
          catalog={tagCatalog}
          activeTag={activeTag}
          rows={taggedOrgs}
        />
        <SuperadminRecommendationNoteSearch query={noteQuery} rows={noteHits} />
        <SuperadminRecommendationOpenPipeline
          rows={openPipeline}
          mineOnly={pipelineMineOnly}
          sort={pipelineSort}
        />
        <SuperadminRecommendationDigest digest={digest} mineOnly={digestMineOnly} />
        <SuperadminCommercialBulkBoard
          items={bulkItems}
          assignees={assignees}
          currentUserId={session.userId}
        />
        <RecommendationSummaryCards summary={recommended.summary} />
        <SuperadminUpgradeQueue rows={upgradeQueue.rows} total={upgradeQueue.total} />
        <SuperadminStaleQueue rows={staleRows} />
        <SuperadminFollowUpQueue rows={followUps} assigneeFilter={assigneeFilter} />
        <SuperadminOutcomeQueue rows={outcomes} outcomeFilter={outcomeFilterRaw} />
        <SuperadminCommercialQueues
          checkoutIntents={checkoutIntents}
          pendingEvents={pendingEvents}
          plansEndingSoon={plansEndingSoon}
          addonsEndingSoon={addonsEndingSoon}
          orgsOverSeats={orgsOverSeats}
        />
        <SuperadminOrgList
          rows={recommended.rows}
          total={recommended.total}
          page={recommended.page}
          pageSize={recommended.pageSize}
          initialSearch={search}
          initialPlanKey={planKey}
          initialStatus={status}
          initialRecommendedPlan={recommendedPlan}
          initialUpgradeFilter={upgradeFilter}
          initialSort={sort}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado';
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">Superadmin no pudo cargar los datos</h1>
        <p className="text-sm text-muted-foreground">
          Tu sesión sí es Superadmin. Falta configuración de Vercel o migraciones en Supabase
          (incluí phase 31–60 de recomendaciones).
        </p>
        <p className="rounded-md bg-muted p-3 font-mono text-xs">{message}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            En Vercel → Environment Variables, agregá <code>SUPABASE_SERVICE_ROLE_KEY</code> y
            redesplegá.
          </li>
          <li>
            En Supabase → SQL Editor, aplicá phase 31–60 (
            <code>20260818360000</code> … <code>20260818650000</code>).
          </li>
          <li>Recargá esta página.</li>
        </ol>
      </div>
    );
  }
}
