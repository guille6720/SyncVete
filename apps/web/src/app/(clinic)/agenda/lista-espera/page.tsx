import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { canManageAppointments, canReadAppointments, getAssignableStaff } from '@/actions/appointments';
import { listWaitlist } from '@/actions/appointment-waitlist';
import { getOwner } from '@/actions/owners';
import { getPatient } from '@/actions/patients';
import { getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/lib/session';
import {
  AppointmentWaitlistBoard,
  type WaitlistEntryView,
} from '@/components/appointments/appointment-waitlist-board';
import { Button } from '@/components/ui/button';

export default async function ListaEsperaPage() {
  const canRead = await canReadAppointments();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  const [entries, staff, branches, canWrite] = await Promise.all([
    listWaitlist({ status: 'open' }),
    getAssignableStaff(),
    getUserBranches(),
    canManageAppointments(),
  ]);

  const enriched: WaitlistEntryView[] = await Promise.all(
    entries.map(async (entry) => {
      const [patient, owner] = await Promise.all([
        getPatient(entry.patient_id).catch(() => null),
        getOwner(entry.owner_id).catch(() => null),
      ]);
      return {
        ...entry,
        patient_name: patient?.name ?? null,
        owner_full_name: owner?.full_name ?? null,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/agenda">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a agenda
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Lista de espera</h1>
          <p className="text-muted-foreground">Pacientes esperando un turno disponible</p>
        </div>
      </div>

      <AppointmentWaitlistBoard
        entries={enriched}
        staff={staff}
        branches={branches}
        defaultBranchId={session?.branchId}
        canWrite={canWrite}
      />
    </div>
  );
}
