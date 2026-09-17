import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  listConsultationQueue,
  listConsultations,
} from '@/actions/consultations';
import { getSessionContext } from '@/lib/session';
import { canUseFeature, FEATURES } from '@/lib/entitlements';
import { ConsultationsQueue } from '@/components/consultations/consultations-queue';
import { ConsultationsHistory } from '@/components/consultations/consultations-history';
import { CONSULTATION_STATUSES, type ConsultationStatus } from '@sincvete/shared';

interface ConsultasPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

async function ConsultationsHistorySection({
  page,
  search,
  status,
}: {
  page: number;
  search: string;
  status: ConsultationStatus | undefined;
}) {
  const history = await listConsultations({
    page,
    pageSize: 25,
    search: search || undefined,
    status,
  });

  return (
    <ConsultationsHistory
      data={history}
      initialSearch={search}
      initialStatus={status ?? ''}
    />
  );
}

export default async function ConsultasPage({ searchParams }: ConsultasPageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session) redirect('/login');

  const canReadPerm =
    session.permissions.includes('clinical:read') ||
    session.permissions.includes('appointments:read');
  if (!canReadPerm) redirect('/dashboard');

  const hasConsultationsFeature = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.CONSULTATIONS,
  });
  if (!hasConsultationsFeature) redirect('/dashboard');

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = CONSULTATION_STATUSES.includes(statusParam as ConsultationStatus)
    ? (statusParam as ConsultationStatus)
    : undefined;

  const canWrite = session.permissions.includes('clinical:write');
  const canHistory = session.permissions.includes('clinical:read');

  const queue = await listConsultationQueue();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consultas</h1>
        <p className="text-muted-foreground">Cola de atención y registro clínico del día</p>
      </div>

      <ConsultationsQueue items={queue} canWrite={canWrite} canReadHistory={canHistory} />

      {canHistory ? (
        <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
          <ConsultationsHistorySection page={page} search={search} status={status} />
        </Suspense>
      ) : null}
    </div>
  );
}
