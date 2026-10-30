'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, UserRound, CalendarDays } from 'lucide-react';
import { createProfessional, updateProfessional } from '@/actions/professionals';
import { ProfessionalHoursEditor, type ProfessionalHoursDraft } from './professional-hours-editor';
import { AgendaProblemNotice } from '@/components/appointments/agenda-problem-notice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  PROFESSIONAL_RELATIONSHIP_TYPES,
  PROFESSIONAL_RELATIONSHIP_LABELS,
  type Professional,
} from '@sincvete/shared';

interface Props {
  mode: 'create' | 'edit';
  professional?: Professional;
  branches: Array<{ id: string; name: string }>;
  branchIds?: string[];
  defaultBranchId?: string | null;
  initialHours?: ProfessionalHoursDraft[];
  draftId?: string;
  canWriteAgenda?: boolean;
  canInvite?: boolean;
}
export function ProfessionalForm({
  mode,
  professional,
  branches,
  branchIds = [],
  defaultBranchId,
  initialHours = [],
  draftId,
  canWriteAgenda = true,
  canInvite = false,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [currentDraftId] = useState(draftId);
  const [showError, setShowError] = useState(true);
  const [state, formAction, pending] = useActionState(
    mode === 'create' ? createProfessional : updateProfessional,
    null
  );
  const [, startTransition] = useTransition();
  const [hours, setHours] = useState(initialHours);
  const [selectedBranches, setSelectedBranches] = useState(
    branchIds.length
      ? branchIds
      : defaultBranchId
        ? [defaultBranchId]
        : branches.length === 1
          ? [branches[0].id]
          : []
  );
  const [prepareInvite, setPrepareInvite] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({
    firstName: professional?.first_name ?? '',
    lastName: professional?.last_name ?? '',
    specialty: professional?.specialty ?? '',
    relationshipType: professional?.relationship_type ?? 'independent',
    taxId: professional?.tax_id ?? '',
    professionalLicense: professional?.professional_license ?? '',
    startDate: professional?.start_date ?? '',
    endDate: professional?.end_date ?? '',
    isActive: professional?.is_active === false ? 'false' : 'true',
    notes: professional?.notes ?? '',
  });
  const [invoiceRequired, setInvoiceRequired] = useState(professional?.invoice_required ?? false);
  const field = (name: string) => ({
    value: fields[name] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setFields((v) => ({ ...v, [name]: e.target.value })),
  });
  const intent = useRef('detail');
  const submittedInvite = useRef(false);
  const savedBranch = useRef(selectedBranches[0] ?? '');
  const errorFor = (key: string) => (showError ? state?.fieldErrors?.[key]?.[0] : undefined);
  useEffect(() => {
    if (state?.error) setShowError(true);
  }, [state]);
  useEffect(() => {
    if (!state?.success || !state.data?.id) return;
    const booking = `/agenda/nueva?${new URLSearchParams({ assigned: state.data.id, branch: state.workflow?.branchId ?? savedBranch.current, created: '1' })}`;
    const destination =
      (state.workflow?.nextStep ?? intent.current) === 'appointment'
        ? booking
        : `/profesionales/${state.data.id}`;
    if ((state.workflow?.prepareInvite ?? submittedInvite.current) && canInvite)
      router.push(
        `/usuarios?${new URLSearchParams({ professional: state.data.id, returnTo: destination })}`
      );
    else if (mode === 'create' || (state.workflow?.nextStep ?? intent.current) === 'appointment')
      router.push(destination);
    else router.refresh();
  }, [state, mode, canInvite, router]);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">
          {mode === 'create' ? 'Nuevo profesional' : 'Editar profesional y agenda'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Creá su ficha y su agenda en un solo lugar. Cada profesional tiene sus propios horarios.
        </p>
      </div>
      {mode === 'create' ? (
        <ol aria-label="Pasos del alta" className="grid grid-cols-3 gap-2 text-center text-sm">
          <li className="rounded-lg bg-primary/10 p-3 font-medium text-primary">1 · Datos</li>
          <li className="rounded-lg bg-primary/10 p-3 font-medium text-primary">2 · Horarios</li>
          <li className="rounded-lg bg-muted p-3 text-muted-foreground">3 · Primer turno</li>
        </ol>
      ) : null}
      <form
        ref={formRef}
        onChange={() => setShowError(false)}
        action={(data) => {
          intent.current = String(data.get('nextStep') || intent.current);
          submittedInvite.current = prepareInvite;
          savedBranch.current = selectedBranches[0] ?? '';
          startTransition(() => formAction(data));
        }}
        className="space-y-5"
      >
        <input
          type="hidden"
          name={mode === 'create' ? 'draftId' : 'id'}
          value={mode === 'create' ? currentDraftId : professional?.id}
        />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5" />
                Datos del profesional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['firstName', 'Nombre'],
                  ['lastName', 'Apellido'],
                ].map(([name, label]) => (
                  <div key={name} className="space-y-2">
                    <Label htmlFor={name}>{label} *</Label>
                    <Input
                      id={name}
                      name={name}
                      required
                      maxLength={100}
                      {...field(name!)}
                      aria-invalid={Boolean(errorFor(name!))}
                    />
                    {errorFor(name!) ? (
                      <p className="text-sm text-destructive">{errorFor(name!)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Especialidad (opcional)</Label>
                <Input
                  id="specialty"
                  name="specialty"
                  maxLength={120}
                  {...field('specialty')}
                  placeholder="Clínica general, cirugía…"
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Sucursal *</legend>
                {branches.length === 0 ? (
                  <p className="text-sm text-destructive">
                    No tenés sucursales habilitadas. Pedile a un administrador que te asigne una.
                  </p>
                ) : (
                  branches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 rounded-md border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="branchIds"
                        value={b.id}
                        checked={selectedBranches.includes(b.id)}
                        onChange={(e) =>
                          setSelectedBranches((old) =>
                            e.target.checked ? [...old, b.id] : old.filter((id) => id !== b.id)
                          )
                        }
                      />
                      {b.name}
                    </label>
                  ))
                )}
              </fieldset>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Más datos opcionales
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="relationshipType">Relación con la clínica</Label>
                    <Select
                      id="relationshipType"
                      name="relationshipType"
                      {...field('relationshipType')}
                    >
                      {PROFESSIONAL_RELATIONSHIP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PROFESSIONAL_RELATIONSHIP_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="taxId">CUIT/CUIL</Label>
                      <Input id="taxId" name="taxId" maxLength={50} {...field('taxId')} />
                    </div>
                    <div>
                      <Label htmlFor="professionalLicense">Matrícula</Label>
                      <Input
                        id="professionalLicense"
                        name="professionalLicense"
                        maxLength={80}
                        {...field('professionalLicense')}
                      />
                    </div>
                  </div>
                  <input
                    type="hidden"
                    name="documentNumber"
                    value={professional?.document_number ?? ''}
                  />
                  <input
                    type="hidden"
                    name="professionalLicenseJurisdiction"
                    value={professional?.professional_license_jurisdiction ?? ''}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="startDate">Inicio</Label>
                      <Input type="date" id="startDate" name="startDate" {...field('startDate')} />
                    </div>
                    <div>
                      <Label htmlFor="endDate">Fin</Label>
                      <Input type="date" id="endDate" name="endDate" {...field('endDate')} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="isActive">Estado</Label>
                    <Select id="isActive" name="isActive" {...field('isActive')}>
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="invoiceRequired"
                      checked={invoiceRequired}
                      onChange={(e) => setInvoiceRequired(e.target.checked)}
                    />
                    Requiere factura
                  </label>
                  <div>
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      maxLength={2000}
                      rows={3}
                      {...field('notes')}
                    />
                  </div>
                </div>
              </details>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                La agenda funciona sin correo ni usuario de acceso.
                {canInvite ? (
                  <label className="mt-3 flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      name="prepareInvite"
                      value="true"
                      checked={prepareInvite}
                      onChange={(e) => setPrepareInvite(e.target.checked)}
                    />
                    <span>
                      Preparar invitación al guardar
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Revisarás el correo y los permisos antes de enviarla. También podés
                        invitarlo después.
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Días y horarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canWriteAgenda ? (
                <>
                  <ProfessionalHoursEditor
                    value={hours}
                    onChange={(next) => {
                      setHours(next);
                      setShowError(false);
                    }}
                    disabled={pending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Al guardar, estos horarios reemplazan los anteriores de este profesional en las
                    sucursales seleccionadas. Los turnos existentes se conservan.
                  </p>
                </>
              ) : (
                <AgendaProblemNotice message="No tenés permiso para modificar horarios. Pedile a un administrador que habilite appointments:write." />
              )}
            </CardContent>
          </Card>
        </div>
        {state?.error && showError ? (
          <AgendaProblemNotice
            message={state.error}
            onRetry={() => formRef.current?.requestSubmit()}
          />
        ) : null}
        {state?.success && mode === 'edit' ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4" />
            Ficha y horarios guardados correctamente.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="max-w-md text-sm text-muted-foreground">
            {hours.length
              ? 'Quedará disponible en Agenda y Nuevo turno al guardar.'
              : 'Podés guardar la ficha ahora y agregar horarios después.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="nextStep"
              value="detail"
              variant="outline"
              disabled={pending || !selectedBranches.length}
            >
              {pending ? 'Guardando…' : mode === 'create' ? 'Guardar y salir' : 'Guardar cambios'}
            </Button>
            {canWriteAgenda ? (
              <Button
                type="submit"
                name="nextStep"
                value="appointment"
                disabled={pending || !selectedBranches.length}
              >
                {mode === 'create' ? 'Guardar y crear primer turno' : 'Guardar y dar turno'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
