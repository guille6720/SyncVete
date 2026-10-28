'use client';

import {
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TutorialNarrationApi } from '@/components/tutorials/use-tutorial-narration';
import { cn } from '@/lib/utils';

interface TutorialVoiceControlsProps {
  narration: TutorialNarrationApi;
  className?: string;
}

const RATE_OPTIONS = [
  { value: 0.85, label: 'Tranquila' },
  { value: 0.92, label: 'Natural' },
  { value: 0.98, label: 'Ágil' },
  { value: 1.05, label: 'Rápida' },
] as const;

export function TutorialVoiceControls({
  narration,
  className,
}: TutorialVoiceControlsProps) {
  const isSpeaking = narration.status === 'speaking';
  const isPaused = narration.status === 'paused';

  return (
    <div
      className={cn('rounded-md border bg-muted/30 px-2 py-2', className)}
      role="group"
      aria-label="Controles de narración"
    >
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>Voz (ElevenLabs)</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
            value={narration.voiceProfile === 'horacio' ? 'horacio' : 'brian'}
            onChange={(event) =>
              narration.setVoiceProfile(
                event.target.value as TutorialNarrationApi['voiceProfile']
              )
            }
            aria-label="Voz de narración"
            disabled={narration.muted}
          >
            <option value="brian">
              {narration.availability.elevenLabs ? 'Brian C' : 'Brian · Tomas (gratis)'}
            </option>
            <option value="horacio">
              {narration.availability.elevenLabs ? 'Horacio' : 'Horacio · Jorge (gratis)'}
            </option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>Velocidad</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
            value={String(narration.rate)}
            onChange={(event) => narration.setRate(Number(event.target.value))}
            aria-label="Velocidad de narración"
            disabled={narration.muted}
          >
            {RATE_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!narration.availability.elevenLabs ? (
        <p className="mb-2 text-[11px] text-emerald-700 dark:text-emerald-300" role="status">
          Tomas/Jorge (gratis). Brian C / Horacio naturales requieren ELEVENLABS_API_KEY en
          producción.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {isSpeaking ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={narration.pause}
            aria-label="Pausar narración"
            title="Pausar"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden />
            Pausar
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={isPaused ? narration.resume : narration.play}
            aria-label={isPaused ? 'Continuar narración' : 'Reproducir narración'}
            title={isPaused ? 'Continuar' : 'Reproducir'}
            disabled={narration.muted}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {isPaused ? 'Continuar' : 'Escuchar'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={narration.replay}
          aria-label="Repetir narración"
          title="Repetir"
          disabled={narration.muted}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={narration.toggleMute}
          aria-label={narration.muted ? 'Activar voz' : 'Silenciar voz'}
          aria-pressed={narration.muted}
          title={narration.muted ? 'Activar' : 'Silenciar'}
        >
          {narration.muted ? (
            <VolumeX className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {narration.activeSource === 'elevenlabs'
            ? 'ElevenLabs'
            : narration.activeSource === 'prerecorded'
              ? 'Audio guardado'
              : narration.activeSource === 'browser'
                ? 'Navegador (respaldo)'
                : 'Listo'}
        </span>
      </div>
    </div>
  );
}
