'use client';

import Link from 'next/link';
import { PawPrint, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SPECIES_EMOJI, type PatientListRow } from '@sincvete/shared';

interface OwnerPatientsPanelProps {
  ownerId: string;
  patients: PatientListRow[];
  total: number;
  canWrite: boolean;
  patientsEnabled?: boolean;
}

export function OwnerPatientsPanel({
  ownerId,
  patients,
  total,
  canWrite,
  patientsEnabled = true,
}: OwnerPatientsPanelProps) {
  if (!patientsEnabled) return null;

  const newPatientHref = `/pacientes/nuevo?ownerId=${encodeURIComponent(ownerId)}&returnTo=${encodeURIComponent(`/propietarios/${ownerId}`)}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <PawPrint className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Pacientes</CardTitle>
          <Badge variant="default">{total}</Badge>
        </div>
        {canWrite && (
          <Button size="sm" asChild>
            <Link href={newPatientHref}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo paciente
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {patients.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Sin pacientes asociados</p>
            {canWrite && (
              <Button className="mt-3" variant="outline" size="sm" asChild>
                <Link href={newPatientHref}>
                  <Plus className="mr-2 h-4 w-4" />
                  Asociar paciente
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {patients.map((patient) => (
              <li key={patient.id}>
                <Link
                  href={`/pacientes/${patient.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {SPECIES_EMOJI[patient.species]} {patient.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {patient.species}
                      {patient.breed ? ` · ${patient.breed}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {patient.is_deceased ? (
                      <Badge variant="destructive">Fallecido</Badge>
                    ) : (
                      <Badge variant={patient.is_active ? 'success' : 'default'}>
                        {patient.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
