import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { canReadProfessionals, getProfessional } from '@/actions/professionals';
import {
  ProfessionalDetailBody,
  ProfessionalDetailBodyFallback,
} from '@/components/professionals/professional-detail-body';
import type { ProfessionalProfileTab } from '@/components/professionals/professional-profile-tabs';
import { svPerfOperation } from '@/lib/perf/nav-timing';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROFILE_TABS: ProfessionalProfileTab[] = [
  'resumen',
  'datos',
  'agenda',
  'honorarios',
  'liquidaciones',
  'acceso',
  'historial',
];

const ROUTE = '/profesionales/[id]';

/**
 * Critical path only: authz + professional identity.
 * Secondary tabs (settlements, agenda, compensation, staff) stream in Suspense.
 */
export default async function ProfesionalDetailPage({ params, searchParams }: PageProps) {
  const canRead = await svPerfOperation(ROUTE, 'canReadProfessionals', () =>
    canReadProfessionals()
  );
  if (!canRead) redirect('/dashboard');

  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();

  const professional = await svPerfOperation(ROUTE, 'getProfessional', () =>
    getProfessional(id)
  );
  if (!professional) notFound();

  const defaultTab = PROFILE_TABS.includes(query.tab as ProfessionalProfileTab)
    ? (query.tab as ProfessionalProfileTab)
    : 'resumen';

  return (
    <Suspense fallback={<ProfessionalDetailBodyFallback professional={professional} />}>
      <ProfessionalDetailBody professional={professional} defaultTab={defaultTab} />
    </Suspense>
  );
}
