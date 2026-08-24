'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlanRecommendation } from '@sincvete/shared';
import {
  changeOrganizationPlan,
  dismissOrganizationPlanRecommendation,
  reviewOrganizationPlanRecommendation,
  saveOrganizationPlanRecommendationAssignee,
  saveOrganizationPlanRecommendationFollowUp,
  saveOrganizationPlanRecommendationFreeze,
  saveOrganizationPlanRecommendationCommercialSnooze,
  saveOrganizationPlanRecommendationNote,
  saveOrganizationPlanRecommendationOutcome,
  saveOrganizationPlanRecommendationContact,
  saveOrganizationPlanRecommendationTags,
} from '@/actions/superadmin';
import {
  COMMERCIAL_OUTCOME_LABELS,
  type CommercialRecommendationOutcome,
} from '@/lib/plan-recommendations/shared';
import type { RecommendationAssigneeOption } from '@/lib/plan-recommendations';
import type { PlanRecommendationCommercialMeta } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export function SuperadminPlanRecommendationPanel({
  organizationId,
  organizationName,
  recommendation,
  comparison,
  commercialMeta = null,
  assignees = [],
  currentUserId = null,
}: {
  organizationId: string;
  organizationName: string;
  recommendation: PlanRecommendation;
  comparison: {
    gained: string[];
    lost: string[];
    limitChanges: Array<{ label: string; from: string; to: string }>;
  } | null;
  commercialMeta?: PlanRecommendationCommercialMeta | null;
  assignees?: RecommendationAssigneeOption[];
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState(commercialMeta?.commercialNote ?? '');
  const [tagsInput, setTagsInput] = useState((commercialMeta?.commercialTags ?? []).join(', '));
  const [assignedTo, setAssignedTo] = useState(commercialMeta?.assignedTo ?? '');
  const [outcome, setOutcome] = useState(commercialMeta?.commercialOutcome ?? '');
  const [outcomeNote, setOutcomeNote] = useState(commercialMeta?.commercialOutcomeNote ?? '');
  const [contactNote, setContactNote] = useState('');
  const [followUpLocal, setFollowUpLocal] = useState(() => {
    if (!commercialMeta?.followUpAt) return '';
    const d = new Date(commercialMeta.followUpAt);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const showAlert =
    recommendation.shouldRecommendUpgrade ||
    recommendation.upgradeStatus === 'legacy_review' ||
    recommendation.upgradeStatus === 'trial_conversion';

  if (!showAlert && recommendation.upgradeStatus === 'none') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recomendación comercial</CardTitle>
          <CardDescription>Sin upgrade recomendado con el uso actual.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Uso máximo: {Math.round(Math.min(recommendation.usageLevel, 1) * 100)}%
        </CardContent>
      </Card>
    );
  }

  async function applyPlan() {
    if (!recommendation.recommendedPlan) return;
    setMessage(null);
    const form = new FormData();
    form.set('organizationId', organizationId);
    form.set('planKey', recommendation.recommendedPlan);
    form.set(
      'reason',
      reason.trim() ||
        `Aceptar recomendación ${recommendation.currentPlan} → ${recommendation.recommendedPlan}`
    );
    const result = await run(() => changeOrganizationPlan(form));
    if (!result) return;
    setMessage(result.success ? 'Plan actualizado' : result.error ?? 'No se pudo cambiar el plan');
    if (result.success) router.refresh();
  }

  return (
    <Card className="border-amber-300/60">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {recommendation.upgradeStatus === 'legacy_review'
            ? 'LEGACY — REVISIÓN COMERCIAL'
            : 'UPGRADE RECOMMENDED'}
          <Badge variant="warning">{recommendation.severity}</Badge>
          {commercialMeta?.isFrozen ? <Badge variant="destructive">Congelada</Badge> : null}
          {commercialMeta?.isCommerciallySnoozed ? <Badge>Snooze comercial</Badge> : null}
          {commercialMeta?.assignedEmail ? (
            <Badge variant="default">{commercialMeta.assignedEmail}</Badge>
          ) : null}
          {commercialMeta?.commercialOutcome ? (
            <Badge
              variant={
                commercialMeta.commercialOutcome === 'won'
                  ? 'success'
                  : commercialMeta.commercialOutcome === 'deferred'
                    ? 'warning'
                    : commercialMeta.commercialOutcome === 'lost' ||
                        commercialMeta.commercialOutcome === 'not_a_fit'
                      ? 'destructive'
                      : 'default'
              }
            >
              {COMMERCIAL_OUTCOME_LABELS[commercialMeta.commercialOutcome]}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {organizationName} está en <strong>{recommendation.currentPlan ?? 'sin plan'}</strong>
          {recommendation.recommendedPlan
            ? `. Según el uso, recomendamos ${recommendation.recommendedPlan}.`
            : '.'}{' '}
          El plan no cambia solo: hace falta una acción explícita.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <div>
          <p className="mb-2 text-sm font-medium">Motivos</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {recommendation.reasons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {comparison ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">Features ganadas</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {comparison.gained.length === 0 ? <li>Ninguna</li> : null}
                {comparison.gained.slice(0, 12).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Límites</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {comparison.limitChanges.length === 0 ? <li>Sin cambios de cupo</li> : null}
                {comparison.limitChanges.slice(0, 8).map((item) => (
                  <li key={item.label}>
                    {item.label}: {item.from} → {item.to}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="recReason">Motivo del cambio (auditoría)</Label>
          <Textarea
            id="recReason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="recNote">Nota comercial interna</Label>
          <Textarea
            id="recNote"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Solo Superadmin. No se muestra a la clínica."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('note', note);
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationNote(form);
                  setMessage(
                    result.success ? 'Nota guardada' : result.error ?? 'No se pudo guardar la nota'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Guardar nota
            </Button>
            {commercialMeta?.lastRefreshedAt ? (
              <span className="text-xs text-muted-foreground">
                Último refresh{' '}
                {new Date(commercialMeta.lastRefreshedAt).toLocaleString('es-AR')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="recTags">Etiquetas comerciales</Label>
          <Input
            id="recTags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="demo, enterprise, churn-risk"
          />
          <div className="flex flex-wrap gap-2">
            {(commercialMeta?.commercialTags ?? []).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('tagMode', 'replace');
                form.set('tags', tagsInput);
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationTags(form);
                  setMessage(
                    result.success
                      ? 'Etiquetas guardadas'
                      : result.error ?? 'No se pudieron guardar las etiquetas'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Guardar etiquetas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setTagsInput('');
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('tagMode', 'replace');
                form.set('tags', '');
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationTags(form);
                  setMessage(
                    result.success
                      ? 'Etiquetas quitadas'
                      : result.error ?? 'No se pudieron quitar'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Quitar todas
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Separá con comas. Se normalizan a minúsculas (máx. 12).
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="recAssignee">Responsable comercial</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              id="recAssignee"
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className="max-w-sm"
            >
              <option value="">Sin asignar</option>
              {assignees.map((admin) => (
                <option key={admin.userId} value={admin.userId}>
                  {admin.email}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('assignedTo', assignedTo);
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationAssignee(form);
                  setMessage(
                    result.success
                      ? assignedTo
                        ? 'Responsable asignado'
                        : 'Responsable quitado'
                      : result.error ?? 'No se pudo asignar'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Guardar
            </Button>
            {currentUserId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending || assignedTo === currentUserId}
                onClick={() => {
                  setAssignedTo(currentUserId);
                  const form = new FormData();
                  form.set('organizationId', organizationId);
                  form.set('assignedTo', currentUserId);
                  void run(async () => {
                    const result = await saveOrganizationPlanRecommendationAssignee(form);
                    setMessage(
                      result.success
                        ? 'Asignada a vos'
                        : result.error ?? 'No se pudo asignar'
                    );
                    if (result.success) router.refresh();
                    return result;
                  });
                }}
              >
                Asignarme
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Solo organiza el seguimiento interno. No cambia el plan.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="recContact">Último contacto comercial</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id="recContact"
              value={contactNote}
              onChange={(event) => setContactNote(event.target.value)}
              placeholder="Nota breve del contacto (opcional)"
              className="max-w-lg"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('contactNote', contactNote);
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationContact(form);
                  setMessage(
                    result.success
                      ? 'Contacto registrado'
                      : result.error ?? 'No se pudo registrar el contacto'
                  );
                  if (result.success) {
                    setContactNote('');
                    router.refresh();
                  }
                  return result;
                });
              }}
            >
              Registrar contacto
            </Button>
          </div>
          {commercialMeta?.lastContactedAt ? (
            <p className="text-xs text-muted-foreground">
              Último: {new Date(commercialMeta.lastContactedAt).toLocaleString('es-AR')}
              {commercialMeta.lastContactNote ? ` · ${commercialMeta.lastContactNote}` : ''}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Todavía sin contacto. Registrar uno reinicia el reloj de stale.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="recOutcome">Resultado comercial</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              id="recOutcome"
              value={outcome}
              onChange={(event) =>
                setOutcome(event.target.value as CommercialRecommendationOutcome | '')
              }
              className="max-w-xs"
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('outcome', outcome);
                form.set('outcomeNote', outcomeNote);
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationOutcome(form);
                  setMessage(
                    result.success
                      ? outcome
                        ? 'Resultado guardado'
                        : 'Resultado quitado'
                      : result.error ?? 'No se pudo guardar el resultado'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Guardar resultado
            </Button>
          </div>
          <Input
            value={outcomeNote}
            onChange={(event) => setOutcomeNote(event.target.value)}
            placeholder="Nota del resultado (opcional)"
            className="max-w-lg"
          />
          <p className="text-xs text-muted-foreground">
            “Ganada” no sube el plan sola. Ganada / perdida / no encaja quitan el follow-up activo.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="recFollowUp">Seguimiento comercial</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id="recFollowUp"
              type="datetime-local"
              value={followUpLocal}
              onChange={(event) => setFollowUpLocal(event.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('followUpAt', followUpLocal);
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationFollowUp(form);
                  setMessage(
                    result.success
                      ? 'Seguimiento guardado'
                      : result.error ?? 'No se pudo guardar el seguimiento'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Guardar fecha
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || !followUpLocal}
              onClick={() => {
                setFollowUpLocal('');
                const form = new FormData();
                form.set('organizationId', organizationId);
                form.set('followUpAt', '');
                void run(async () => {
                  const result = await saveOrganizationPlanRecommendationFollowUp(form);
                  setMessage(
                    result.success
                      ? 'Seguimiento quitado'
                      : result.error ?? 'No se pudo quitar el seguimiento'
                  );
                  if (result.success) router.refresh();
                  return result;
                });
              }}
            >
              Quitar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={commercialMeta?.isFrozen ? 'outline' : 'secondary'}
            disabled={pending}
            onClick={() => {
              const form = new FormData();
              form.set('organizationId', organizationId);
              form.set('frozen', commercialMeta?.isFrozen ? 'false' : 'true');
              form.set(
                'note',
                commercialMeta?.isFrozen
                  ? ''
                  : 'Congelada para seguimiento comercial; el refresh no la limpia'
              );
              void run(async () => {
                const result = await saveOrganizationPlanRecommendationFreeze(form);
                setMessage(
                  result.success
                    ? commercialMeta?.isFrozen
                      ? 'Recomendación descongelada'
                      : 'Recomendación congelada'
                    : result.error ?? 'No se pudo actualizar el freeze'
                );
                if (result.success) router.refresh();
                return result;
              });
            }}
          >
            {commercialMeta?.isFrozen ? 'Descongelar' : 'Congelar recomendación'}
          </Button>
          {commercialMeta?.isFrozen && commercialMeta.frozenAt ? (
            <span className="text-xs text-muted-foreground">
              Desde {new Date(commercialMeta.frozenAt).toLocaleString('es-AR')}
              {commercialMeta.frozenNote ? ` · ${commercialMeta.frozenNote}` : ''}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Congelar evita que el refresh masivo limpie este aviso.
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label>Snooze comercial</Label>
          <p className="text-xs text-muted-foreground">
            Saca de prioridad y digest temporalmente (no es freeze ni cambia el plan).
            {commercialMeta?.isCommerciallySnoozed && commercialMeta.commercialSnoozeUntil
              ? ` Activo hasta ${new Date(commercialMeta.commercialSnoozeUntil).toLocaleString('es-AR')}.`
              : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {[3, 7, 14, 30].map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set('organizationId', organizationId);
                  form.set('days', String(days));
                  form.set('note', `Snooze comercial ${days}d`);
                  void run(async () => {
                    const result = await saveOrganizationPlanRecommendationCommercialSnooze(form);
                    setMessage(
                      result.success
                        ? `Snooze ${days}d aplicado`
                        : result.error ?? 'No se pudo snoozear'
                    );
                    if (result.success) router.refresh();
                    return result;
                  });
                }}
              >
                {days}d
              </Button>
            ))}
            {commercialMeta?.isCommerciallySnoozed ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set('organizationId', organizationId);
                  form.set('clear', '1');
                  void run(async () => {
                    const result = await saveOrganizationPlanRecommendationCommercialSnooze(form);
                    setMessage(
                      result.success
                        ? 'Snooze comercial quitado'
                        : result.error ?? 'No se pudo quitar el snooze'
                    );
                    if (result.success) router.refresh();
                    return result;
                  });
                }}
              >
                Despertar
              </Button>
            ) : null}
          </div>
          {commercialMeta?.commercialSnoozeNote ? (
            <p className="text-xs text-muted-foreground">{commercialMeta.commercialSnoozeNote}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="#suscripcion">Ver detalle</Link>
          </Button>
          {recommendation.recommendedPlan ? (
            <Button type="button" disabled={pending} onClick={() => void applyPlan()}>
              Cambiar a {recommendation.recommendedPlan}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const form = new FormData();
              form.set('organizationId', organizationId);
              void run(async () => {
                const result = await dismissOrganizationPlanRecommendation(form);
                if (result.success) router.refresh();
                return result;
              });
            }}
          >
            Dismiss recommendation
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const form = new FormData();
              form.set('organizationId', organizationId);
              void run(async () => {
                const result = await reviewOrganizationPlanRecommendation(form);
                if (result.success) router.refresh();
                return result;
              });
            }}
          >
            Mark reviewed
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
