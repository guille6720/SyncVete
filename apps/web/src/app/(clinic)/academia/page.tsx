import { redirect } from 'next/navigation';
import { buildAcademyCards } from '@sincvete/shared';
import { getSessionContext } from '@/lib/session';
import { isAcademiaEnabled } from '@/lib/tutorials/feature-flag';
import { AcademiaClient } from '@/components/tutorials/academia-client';
import { TOUR_TARGETS } from '@sincvete/shared';

export default async function AcademiaPage() {
  if (!isAcademiaEnabled()) {
    redirect('/dashboard');
  }

  const session = await getSessionContext();
  if (!session?.role) redirect('/login');
  if (!session.permissions.includes('appointments:read')) {
    redirect('/dashboard');
  }

  const cards = buildAcademyCards(session.role, {});

  return (
    <div className="space-y-6" data-tour={TOUR_TARGETS.ACADEMIA_ROOT}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Academia SyncVete</h1>
        <p className="text-muted-foreground">
          Tutoriales interactivos y guiones de video para aprender los módulos de la clínica.
        </p>
      </div>
      <AcademiaClient cards={cards} />
    </div>
  );
}
