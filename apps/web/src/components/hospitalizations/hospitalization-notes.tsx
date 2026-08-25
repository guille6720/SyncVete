'use client';

import { useActionState, useRef } from 'react';
import { addHospitalizationNote } from '@/actions/hospitalizations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CLINICAL_FIELD_LABELS,
  HOSPITALIZATION_NOTE_TYPES,
  HOSPITALIZATION_NOTE_TYPE_LABELS,
  formatClinicalEntryDateTime,
  type ActionResult,
  type HospitalizationNote,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface HospitalizationNotesProps {
  hospitalizationId: string;
  notes: HospitalizationNote[];
  canWrite: boolean;
  isActive: boolean;
  settlementClaimsByNoteId?: Record<string, SettlementSourceClaimInfo>;
  settlementDetailBasePath?: string;
}

export function HospitalizationNotes({
  hospitalizationId,
  notes,
  canWrite,
  isActive,
  settlementClaimsByNoteId = {},
  settlementDetailBasePath = '/liquidaciones',
}: HospitalizationNotesProps) {
  return (
    <div className="space-y-4">
      {canWrite && isActive && <NoteForm hospitalizationId={hospitalizationId} />}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay evoluciones.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} id={`note-${note.id}`} className="scroll-mt-24 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{HOSPITALIZATION_NOTE_TYPE_LABELS[note.note_type]}</Badge>
                <p className="text-sm text-muted-foreground">
                  {formatClinicalEntryDateTime(note.recorded_at)}
                  {note.recorded_by_name ? ` · ${note.recorded_by_name}` : ''}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{note.content}</p>
              {(note.weight_kg != null || note.temperature_c != null) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {note.weight_kg != null ? `${CLINICAL_FIELD_LABELS.weightKg}: ${note.weight_kg}` : ''}
                  {note.weight_kg != null && note.temperature_c != null ? ' · ' : ''}
                  {note.temperature_c != null
                    ? `${CLINICAL_FIELD_LABELS.temperatureC}: ${note.temperature_c}`
                    : ''}
                </p>
              )}
              {settlementClaimsByNoteId[note.id] ? (
                <SettlementSourceBadge
                  claim={settlementClaimsByNoteId[note.id]}
                  compact
                  detailHref={`${settlementDetailBasePath}/${settlementClaimsByNoteId[note.id].settlementId}`}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteForm({ hospitalizationId }: { hospitalizationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = addHospitalizationNote.bind(null, hospitalizationId);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.success) formRef.current?.reset();
      return result;
    },
    null
  );

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="noteType">Tipo</Label>
          <Select id="noteType" name="noteType" defaultValue="evolucion">
            {HOSPITALIZATION_NOTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {HOSPITALIZATION_NOTE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="weightKg">{CLINICAL_FIELD_LABELS.weightKg}</Label>
          <Input id="weightKg" name="weightKg" type="number" step="0.01" min="0" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="temperatureC">{CLINICAL_FIELD_LABELS.temperatureC}</Label>
          <Input id="temperatureC" name="temperatureC" type="number" step="0.1" min="30" max="45" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Evolución *</Label>
        <Textarea id="content" name="content" required rows={3} placeholder="Come, bebe, mucosas..." />
        {state?.fieldErrors?.content?.[0] && (
          <p className="text-sm text-destructive">{state.fieldErrors.content[0]}</p>
        )}
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando...' : 'Agregar evolución'}
        </Button>
      </div>
    </form>
  );
}
