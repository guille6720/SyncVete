import { notFound } from 'next/navigation';
import { PortalShell } from '@/components/portal/portal-shell';
import { OwnerAppDashboard } from '@/components/portal/owner-app-dashboard';
import { OwnerAppInstall } from '@/components/portal/owner-app-install';
import { LoginForm } from '@/components/auth/login-form';
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

const brand = {
  appName: 'app-IMILVET',
  logoUrl: '',
  primaryColor: '#7c3aed',
  welcomeText: 'Bienvenida a IMILVET',
  enabled: true,
};

export default async function OwnerAppVisual({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { view } = await searchParams;
  if (view === 'install')
    return (
      <OwnerAppInstall brand={brand} clinicName="Veterinaria IMILVET">
        <LoginForm brand={brand} />
      </OwnerAppInstall>
    );
  return (
    <PortalShell
      userName="Maria"
      showAlerts={false}
      brand={brand}
      signOutAction={async () => {
        'use server';
      }}
    >
      {view === 'home' ? (
        <OwnerAppDashboard home={home} />
      ) : (
        <>
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
            <OwnerAppDashboard home={home} />
          </div>
        </>
      )}
    </PortalShell>
  );
}
