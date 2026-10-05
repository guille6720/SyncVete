import { notFound } from 'next/navigation';
import { PortalShell } from '@/components/portal/portal-shell';
import { PortalHome } from '@/components/portal/portal-home';
import { OwnerAppAgenda } from '@/components/portal/owner-app-agenda';
import { OwnerVaccineCalendar } from '@/components/portal/owner-vaccine-calendar';
import type { OwnerPortalHome } from '@sincvete/shared';

const patient = {
  id: 'dddddddd-0000-4000-8000-000000000001',
  name: 'Luna',
  species: 'Canino' as const,
  breed: 'Labrador',
  sex: 'Hembra' as const,
  birthDate: '2021-01-01',
  isDeceased: false,
};
const date = new Date();
date.setDate(date.getDate() + 1);
const home: OwnerPortalHome = {
  clinic: { name: 'IMILVET', phone: '011 4444 5555', email: 'clinica@example.test' },
  owner: {
    id: 'cccccccc-0000-4000-8000-000000000001',
    fullName: 'Maria',
    email: 'owner@example.test',
    phone: null,
  },
  patients: [patient],
  upcomingAppointments: [],
  vaccinesDue: [
    {
      id: 'vaccine',
      patientId: patient.id,
      patientName: 'Luna',
      vaccineName: 'Antirrabica',
      administeredAt: '2025-10-05',
      nextDueAt: date.toISOString().slice(0, 10),
      dueStatus: 'por_vencer',
    },
  ],
  invoices: [],
  recentClinical: [
    {
      id: 'entry',
      patientId: patient.id,
      patientName: patient.name,
      entryDate: date.toISOString(),
      entryType: 'consulta',
      title: 'Control',
      diagnosis: 'Control de evolucion',
      treatment: 'Tratamiento indicado por la veterinaria',
      plan: 'Proximo control en 7 dias',
      weightKg: 22,
    },
  ],
};

export default function OwnerAppVisual() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <PortalShell
      userName="Maria"
      showAlerts={false}
      brand={{
        appName: 'app-IMILVET',
        logoUrl: '/icons/apple-touch-icon.png',
        primaryColor: '#16745c',
        welcomeText: 'Bienvenida a IMILVET',
        enabled: true,
      }}
      signOutAction={async () => {
        'use server';
      }}
    >
      <OwnerAppAgenda
        slots={[
          {
            id: 'aaaaaaaa-0000-4000-8000-000000000001',
            starts_at: date.toISOString(),
            ends_at: date.toISOString(),
            branch_name: 'IMILVET',
          },
        ]}
        patients={[patient]}
        reminders={[
          {
            id: 'notice',
            message: 'Vacuna antirrabica de Luna manana',
            created_at: date.toISOString(),
          },
        ]}
        bookings={[]}
      />
      <div className="mt-6">
        <OwnerVaccineCalendar vaccines={home.vaccinesDue} />
      </div>
      <div className="mt-6">
        <PortalHome home={home} />
      </div>
    </PortalShell>
  );
}
