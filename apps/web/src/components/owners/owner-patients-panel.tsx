'use client';

import Link from 'next/link';
import { Eye, PawPrint, Pencil, Plus } from 'lucide-react';
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

  const newPatientHref = `/propietarios/${ownerId}/pacientes/nuevo`;

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
              Agregar paciente
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
                  Agregar paciente
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {patients.map((patient) => {
              const editHref = `/propietarios/${ownerId}/pacientes/${patient.id}/editar`;
              const viewHref = `/pacientes/${patient.id}`;

              return (
                <li
                  key={patient.id}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {SPECIES_EMOJI[patient.species]} {patient.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {patient.species}
                      {patient.breed ? ` · ${patient.breed}` : ''}
                    </p>
                    <div className="mt-1.5">
                      {patient.is_deceased ? (
                        <Badge variant="destructive">Fallecido</Badge>
                      ) : (
                        <Badge variant={patient.is_active ? 'success' : 'default'}>
                          {patient.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={viewHref}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Ver
                      </Link>
                    </Button>
                    {canWrite && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={editHref}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Editar
                        </Link>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
