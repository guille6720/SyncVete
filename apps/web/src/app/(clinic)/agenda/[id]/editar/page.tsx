import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  getAppointment,
  canManageAppointments,
  getBookableAssignableStaff,
} from '@/actions/appointments';
import { getUserBranches } from '@/actions/settings';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { Button } from '@/components/ui/button';

interface EditarCitaPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarCitaPage({ params }: EditarCitaPageProps) {
  const canWrite = await canManageAppointments();
  if (!canWrite) redirect('/agenda');

  const { id } = await params;
  const [appointment, staff, branches] = await Promise.all([
    getAppointment(id),
    getBookableAssignableStaff(),
    getUserBranches(),
  ]);

  if (!appointment) notFound();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/agenda/${id}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a la cita
        </Link>
      </Button>
      <AppointmentForm appointment={appointment} staff={staff} branches={branches} />
    </div>
  );
}
