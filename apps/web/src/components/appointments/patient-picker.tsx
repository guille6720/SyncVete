'use client';

import { useEffect, useRef, useState } from 'react';
import { createOwner } from '@/actions/owners';
import { createPatient, searchPatientsForSelect } from '@/actions/patients';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import { cn } from '@/lib/utils';
import {
  PATIENT_SPECIES,
  SPECIES_EMOJI,
  type PatientSpecies,
} from '@sincvete/shared';

interface PatientPickerProps {
  defaultPatientId?: string;
  defaultPatientName?: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  defaultBranchId?: string | null;
  error?: string;
}

export function PatientPicker({
  defaultPatientId,
  defaultPatientName,
  defaultOwnerId,
  defaultOwnerName,
  defaultBranchId,
  error,
}: PatientPickerProps) {
  const [query, setQuery] = useState(defaultPatientName ?? '');
  const [patientId, setPatientId] = useState(defaultPatientId ?? '');
  const [ownerId, setOwnerId] = useState(defaultOwnerId ?? '');
  const [ownerName, setOwnerName] = useState(defaultOwnerName ?? '');
  const [results, setResults] = useState<
    Array<{
      id: string;
      name: string;
      species: string;
      owner_id: string;
      owner_full_name: string;
    }>
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, runPending] = usePendingAction();
  const debouncedQuery = useDebouncedValue(query);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    searchPatientsForSelect(debouncedQuery)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectPatient = (patient: (typeof results)[number]) => {
    setPatientId(patient.id);
    setOwnerId(patient.owner_id);
    setOwnerName(patient.owner_full_name);
    setQuery(patient.name);
    setOpen(false);
  };

  const handleQuickCreate = (formData: FormData) => {
    const ownerFullName = String(formData.get('fullName') ?? '').trim();
    const patientName = String(formData.get('name') ?? '').trim();
    const species = String(formData.get('species') ?? 'Canino');
    const phone = String(formData.get('phone') ?? '');
    const branchId = defaultBranchId ?? '';

    void runPending(async () => {
      setCreateError(null);

      const ownerFd = new FormData();
      ownerFd.set('fullName', ownerFullName);
      ownerFd.set('phone', phone);
      ownerFd.set('documentType', 'DNI');
      ownerFd.set('isActive', 'true');
      if (branchId) ownerFd.set('branchId', branchId);

      const ownerResult = await createOwner(null, ownerFd);
      if (!ownerResult.success || !ownerResult.data?.id) {
        setCreateError(ownerResult.error ?? 'No se pudo crear el tutor');
        return;
      }

      const patientFd = new FormData();
      patientFd.set('name', patientName);
      patientFd.set('ownerId', ownerResult.data.id);
      patientFd.set('species', species);
      patientFd.set('sex', 'Desconocido');
      patientFd.set('isActive', 'true');
      if (branchId) patientFd.set('branchId', branchId);

      const patientResult = await createPatient(null, patientFd);
      if (!patientResult.success || !patientResult.data?.id) {
        setCreateError(patientResult.error ?? 'No se pudo crear el paciente');
        return;
      }

      setPatientId(patientResult.data.id);
      setOwnerId(ownerResult.data.id);
      setOwnerName(ownerFullName);
      setQuery(patientName);
      setCreateOpen(false);
    });
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Label htmlFor="patientSearch">Paciente *</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => {
          setCreateError(null);
          setCreateOpen(true);
        }}>
          Crear paciente/tutor
        </Button>
      </div>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <div className="relative">
        <Input
          id="patientSearch"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPatientId('');
            setOwnerId('');
            setOwnerName('');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar paciente por nombre o microchip..."
          autoComplete="off"
        />
        {open && (results.length > 0 || loading) && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
            {loading && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Buscando...</li>
            )}
            {results.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-accent',
                    patientId === patient.id && 'bg-accent'
                  )}
                  onClick={() => selectPatient(patient)}
                >
                  {SPECIES_EMOJI[patient.species as PatientSpecies]} {patient.name}
                  <span className="block text-xs text-muted-foreground">
                    {patient.owner_full_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {ownerName && (
        <p className="text-xs text-muted-foreground">Propietario: {ownerName}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!patientId && query && !loading && (
        <p className="text-xs text-muted-foreground">Seleccioná un paciente de la lista</p>
      )}

      <ModalShell
        open={createOpen}
        titleId="create-patient-owner-title"
        title="Crear paciente y tutor"
        description="Alta rápida. El resto de datos se pueden completar después."
        onClose={() => setCreateOpen(false)}
        maxWidthClassName="max-w-lg"
      >
        <form action={handleQuickCreate} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-owner-name">Tutor *</Label>
            <Input id="quick-owner-name" name="fullName" required placeholder="Nombre del tutor" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-owner-phone">Teléfono</Label>
            <Input id="quick-owner-phone" name="phone" placeholder="11 5555-5555" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-patient-name">Paciente *</Label>
              <Input id="quick-patient-name" name="name" required placeholder="Nombre del paciente" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-patient-species">Especie</Label>
              <Select id="quick-patient-species" name="species" defaultValue="Canino">
                {PATIENT_SPECIES.map((species) => (
                  <option key={species} value={species}>
                    {SPECIES_EMOJI[species]} {species}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {createError && <p className="text-sm text-destructive">{createError}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isPending={pending}>
              {pending ? 'Creando...' : 'Crear y seleccionar'}
            </Button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
