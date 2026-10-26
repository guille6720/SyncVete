import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMeteredUsage, isQuotaNearLimit, type SeatUsageMeter } from '@sincvete/shared';

interface TeamPanelProps {
  seatMeters?: SeatUsageMeter[];
  showProfessionalsLink?: boolean;
}

export function TeamPanel({ seatMeters = [], showProfessionalsLink = false }: TeamPanelProps) {
  return (
    <div className="space-y-4">
      {seatMeters.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {seatMeters.map((meter, index) => (
            <span key={meter.featureKey}>
              {index > 0 ? ' · ' : ''}
              <span className={isQuotaNearLimit(meter) ? 'text-amber-700 dark:text-amber-300' : undefined}>
                {meter.label}: {formatMeteredUsage(meter)}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Usuarios y permisos</CardTitle>
          <CardDescription>
            Invitá usuarios, asigná roles y permisos por módulo, suspendé accesos y revisá la
            actividad del equipo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/usuarios">Gestionar usuarios</Link>
          </Button>
        </CardContent>
      </Card>
      {showProfessionalsLink ? (
        <Card>
          <CardHeader>
            <CardTitle>Profesionales y liquidaciones</CardTitle>
            <CardDescription>
              Registro operativo de compensación (independiente del equipo de usuarios)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/profesionales">Ir a profesionales</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
