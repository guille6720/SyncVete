'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  bulkAssignOrganizationPlanRecommendations,
  bulkContactOrganizationPlanRecommendations,
  bulkFollowUpOrganizationPlanRecommendations,
  bulkFreezeOrganizationPlanRecommendations,
  bulkNoteOrganizationPlanRecommendations,
  bulkOutcomeOrganizationPlanRecommendations,
  bulkSnoozeOrganizationPlanRecommendations,
  bulkTagOrganizationPlanRecommendations,
} from '@/actions/superadmin';
import {
  COMMERCIAL_OUTCOME_LABELS,
  type CommercialRecommendationOutcome,
} from '@/lib/plan-recommendations/shared';
import type { RecommendationAssigneeOption } from '@/lib/plan-recommendations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export type CommercialBulkItem = {
  organizationId: string;
  organizationName: string;
  detail: string;
  source: string;
};

export function SuperadminCommercialBulkBoard({
  items,
  assignees = [],
  currentUserId = null,
}: {
  items: CommercialBulkItem[];
  assignees?: RecommendationAssigneeOption[];
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [assignedTo, setAssignedTo] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [followUpLocal, setFollowUpLocal] = useState('');
  const [outcome, setOutcome] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [freezeNote, setFreezeNote] = useState(
    'Congelada en masa; el refresh no la limpia'
  );
  const [snoozeDays, setSnoozeDays] = useState('7');
  const [snoozeNote, setSnoozeNote] = useState('Snooze comercial masivo');
  const [commercialNote, setCommercialNote] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const deduped = useMemo(() => {
    const map = new Map<string, CommercialBulkItem>();
    for (const item of items) {
      const prev = map.get(item.organizationId);
      if (!prev) {
        map.set(item.organizationId, item);
        continue;
      }
      map.set(item.organizationId, {
        ...prev,
        source: prev.source.includes(item.source)
          ? prev.source
          : `${prev.source}, ${item.source}`,
      });
    }
    return Array.from(map.values()).slice(0, 50);
  }, [items]);

  const selectedIds = deduped
    .filter((item) => selected[item.organizationId])
    .map((item) => item.organizationId);

  if (deduped.length === 0) return null;

  function requireSelection() {
    if (selectedIds.length === 0) {
      setMessage('Seleccioná al menos una clínica');
      return false;
    }
    return true;
  }

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll(next: boolean) {
    const map: Record<string, boolean> = {};
    for (const item of deduped) map[item.organizationId] = next;
    setSelected(map);
  }

  async function runAssign(target: string | null) {
    if (!requireSelection()) return;
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('assignedTo', target ?? '');
    const result = await run(() => bulkAssignOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo asignar');
      return;
    }
    setMessage(
      `Asignación: ${result.data.updated} ok, ${result.data.skipped} sin cambio, ${result.data.errors} error`
    );
    router.refresh();
  }

  async function runContact() {
    if (!requireSelection()) return;
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('contactNote', contactNote);
    const result = await run(() => bulkContactOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo registrar contacto');
      return;
    }
    setMessage(`Contacto: ${result.data.updated} ok, ${result.data.errors} error`);
    setContactNote('');
    router.refresh();
  }

  async function runFollowUp(clear = false) {
    if (!requireSelection()) return;
    if (!clear && !followUpLocal) {
      setMessage('Elegí una fecha de seguimiento');
      return;
    }
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('followUpAt', clear ? '' : followUpLocal);
    const result = await run(() => bulkFollowUpOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo guardar el seguimiento');
      return;
    }
    setMessage(
      clear
        ? `Seguimiento quitado: ${result.data.updated} ok, ${result.data.errors} error`
        : `Seguimiento: ${result.data.updated} ok, ${result.data.errors} error`
    );
    if (clear) setFollowUpLocal('');
    router.refresh();
  }

  async function runOutcome(clear = false) {
    if (!requireSelection()) return;
    if (!clear && !outcome) {
      setMessage('Elegí un resultado comercial');
      return;
    }
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('outcome', clear ? '' : outcome);
    form.set('outcomeNote', outcomeNote);
    const result = await run(() => bulkOutcomeOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo guardar el resultado');
      return;
    }
    setMessage(
      `Resultado: ${result.data.updated} ok, ${result.data.skipped} sin cambio, ${result.data.errors} error`
    );
    if (clear) {
      setOutcome('');
      setOutcomeNote('');
    }
    router.refresh();
  }

  async function runFreeze(frozen: boolean) {
    if (!requireSelection()) return;
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('frozen', frozen ? 'true' : 'false');
    form.set('freezeNote', frozen ? freezeNote : '');
    const result = await run(() => bulkFreezeOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo actualizar el freeze');
      return;
    }
    setMessage(
      frozen
        ? `Congeladas: ${result.data.updated} ok, ${result.data.errors} error`
        : `Descongeladas: ${result.data.updated} ok, ${result.data.errors} error`
    );
    router.refresh();
  }

  async function runSnooze(clear: boolean) {
    if (!requireSelection()) return;
    const days = Number(snoozeDays);
    if (!clear && (!Number.isFinite(days) || days < 1 || days > 90)) {
      setMessage('Snooze debe ser entre 1 y 90 días');
      return;
    }
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    if (clear) form.set('clear', '1');
    else form.set('days', String(days));
    form.set('note', snoozeNote);
    const result = await run(() => bulkSnoozeOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo actualizar el snooze');
      return;
    }
    setMessage(
      clear
        ? `Despertadas: ${result.data.updated} ok, ${result.data.errors} error`
        : `Snooze: ${result.data.updated} ok, ${result.data.errors} error`
    );
    router.refresh();
  }

  async function runNote(mode: 'replace' | 'append' | 'clear') {
    if (!requireSelection()) return;
    if (mode !== 'clear' && !commercialNote.trim()) {
      setMessage('Escribí una nota comercial');
      return;
    }
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('noteMode', mode);
    form.set('commercialNote', commercialNote);
    const result = await run(() => bulkNoteOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudo guardar la nota');
      return;
    }
    setMessage(
      mode === 'clear'
        ? `Notas quitadas: ${result.data.updated} ok, ${result.data.errors} error`
        : mode === 'append'
          ? `Notas agregadas: ${result.data.updated} ok, ${result.data.errors} error`
          : `Notas reemplazadas: ${result.data.updated} ok, ${result.data.errors} error`
    );
    if (mode === 'clear') setCommercialNote('');
    router.refresh();
  }

  async function runTags(mode: 'add' | 'remove' | 'replace') {
    if (!requireSelection()) return;
    if (mode !== 'replace' && !tagsInput.trim()) {
      setMessage('Escribí al menos una etiqueta');
      return;
    }
    const form = new FormData();
    form.set('organizationIds', selectedIds.join(','));
    form.set('tagMode', mode);
    form.set('tags', tagsInput);
    const result = await run(() => bulkTagOrganizationPlanRecommendations(form));
    if (!result) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'No se pudieron actualizar las etiquetas');
      return;
    }
    setMessage(
      `Etiquetas (${mode}): ${result.data.updated} ok, ${result.data.skipped} sin cambio, ${result.data.errors} error`
    );
    router.refresh();
  }

  return (
    <Card id="acciones-masivas">
      <CardHeader>
        <CardTitle>Acciones masivas</CardTitle>
        <CardDescription>
          Asignar, contactar, agendar follow-up, cerrar resultado, congelar, anotar o etiquetar en
          hasta 50 clínicas. No cambia planes (ni “Ganada”).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => toggleAll(true)}>
            Seleccionar todas
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => toggleAll(false)}>
            Limpiar
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedIds.length} seleccionadas · {deduped.length} en lista
          </span>
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
          {deduped.map((item) => (
            <label
              key={item.organizationId}
              className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(selected[item.organizationId])}
                onChange={() => toggle(item.organizationId)}
              />
              <span>
                <Link
                  href={`/superadmin/organizaciones/${item.organizationId}`}
                  className="font-medium hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {item.organizationName}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {item.detail} · {item.source}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bulkAssignee">Responsable</Label>
            <Select
              id="bulkAssignee"
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
            >
              <option value="">Sin asignar</option>
              {assignees.map((admin) => (
                <option key={admin.userId} value={admin.userId}>
                  {admin.email}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runAssign(assignedTo || null)}
              >
                Guardar asignación
              </Button>
              {currentUserId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setAssignedTo(currentUserId);
                    void runAssign(currentUserId);
                  }}
                >
                  Asignarme
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setAssignedTo('');
                  void runAssign(null);
                }}
              >
                Quitar responsable
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulkContact">Contacto masivo</Label>
            <Input
              id="bulkContact"
              value={contactNote}
              onChange={(event) => setContactNote(event.target.value)}
              placeholder="Nota breve (opcional)"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void runContact()}
            >
              Registrar contacto
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulkFollowUp">Seguimiento masivo</Label>
            <Input
              id="bulkFollowUp"
              type="datetime-local"
              value={followUpLocal}
              onChange={(event) => setFollowUpLocal(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runFollowUp(false)}
              >
                Guardar fecha
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void runFollowUp(true)}
              >
                Quitar follow-up
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulkOutcome">Resultado masivo</Label>
            <Select
              id="bulkOutcome"
              value={outcome}
              onChange={(event) =>
                setOutcome(event.target.value as CommercialRecommendationOutcome | '')
              }
            >
              <option value="">Sin resultado</option>
              {(Object.keys(COMMERCIAL_OUTCOME_LABELS) as CommercialRecommendationOutcome[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {COMMERCIAL_OUTCOME_LABELS[key]}
                  </option>
                )
              )}
            </Select>
            <Input
              value={outcomeNote}
              onChange={(event) => setOutcomeNote(event.target.value)}
              placeholder="Nota del resultado (opcional)"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runOutcome(false)}
              >
                Guardar resultado
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void runOutcome(true)}
              >
                Quitar resultado
              </Button>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bulkFreeze">Congelar masivo</Label>
            <Input
              id="bulkFreeze"
              value={freezeNote}
              onChange={(event) => setFreezeNote(event.target.value)}
              placeholder="Nota de freeze (opcional)"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runFreeze(true)}
              >
                Congelar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void runFreeze(false)}
              >
                Descongelar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Congelar evita que el refresh masivo limpie estas recomendaciones.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bulkSnoozeDays">Snooze comercial masivo</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="bulkSnoozeDays"
                type="number"
                min={1}
                max={90}
                className="w-24"
                value={snoozeDays}
                onChange={(event) => setSnoozeDays(event.target.value)}
              />
              <Input
                value={snoozeNote}
                onChange={(event) => setSnoozeNote(event.target.value)}
                placeholder="Nota de snooze (opcional)"
                className="min-w-[200px] flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runSnooze(false)}
              >
                Snoozear
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void runSnooze(true)}
              >
                Despertar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Saca de prioridad y digest hasta la fecha. No es freeze.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bulkNote">Nota comercial masiva</Label>
            <Input
              id="bulkNote"
              value={commercialNote}
              onChange={(event) => setCommercialNote(event.target.value)}
              placeholder="Ej. Campaña mayo / pidió demo"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runNote('replace')}
              >
                Reemplazar nota
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runNote('append')}
              >
                Agregar al final
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void runNote('clear')}
              >
                Quitar nota
              </Button>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bulkTags">Etiquetas masivas</Label>
            <Input
              id="bulkTags"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="demo, enterprise"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runTags('add')}
              >
                Agregar etiquetas
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void runTags('remove')}
              >
                Quitar etiquetas
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void runTags('replace')}
              >
                Reemplazar todas
              </Button>
            </div>
          </div>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
