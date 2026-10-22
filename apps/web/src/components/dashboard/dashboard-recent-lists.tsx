import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatRelativeTime,
  SPECIES_EMOJI,
  type DashboardRecentOwner,
  type DashboardRecentPatient,
} from '@sincvete/shared';

interface DashboardRecentListsProps {
  recentPatients: DashboardRecentPatient[];
  recentOwners: DashboardRecentOwner[];
}

export function DashboardRecentLists({
  recentPatients,
  recentOwners,
}: DashboardRecentListsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-tour="dashboard-activity">
      <Card className="border-teal-200/70 bg-card/95 text-card-foreground shadow-sm backdrop-blur-sm dark:border-teal-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Últimos pacientes</CardTitle>
            <CardDescription>Registros recientes</CardDescription>
          </div>
          <Link
            href="/pacientes"
            className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
          >
            Ver todos
          </Link>
        </CardHeader>
        <CardContent>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pacientes registrados.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentPatients.map((patient) => (
                <li key={patient.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <Link
                      href={`/pacientes/${patient.id}`}
                      className="font-medium text-foreground hover:text-teal-700 hover:underline dark:hover:text-teal-300"
                    >
                      {SPECIES_EMOJI[patient.species]} {patient.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{patient.owner_full_name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(patient.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-sky-200/70 bg-card/95 text-card-foreground shadow-sm backdrop-blur-sm dark:border-sky-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Últimos propietarios</CardTitle>
            <CardDescription>Registros recientes</CardDescription>
          </div>
          <Link
            href="/propietarios"
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            Ver todos
          </Link>
        </CardHeader>
        <CardContent>
          {recentOwners.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin propietarios registrados.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentOwners.map((owner) => (
                <li key={owner.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/propietarios/${owner.id}`}
                    className="font-medium text-foreground hover:text-sky-700 hover:underline dark:hover:text-sky-300"
                  >
                    {owner.full_name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(owner.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
