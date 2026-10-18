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
  { value: 0.85, label: '0.85×' },
  { value: 0.95, label: '0.95×' },
  { value: 1.05, label: '1.05×' },
  { value: 1.2, label: '1.2×' },
] as const;

export function TutorialVoiceControls({
  narration,
  className,
}: TutorialVoiceControlsProps) {
  if (!narration.supported) {
    return (
      <p
        className={cn('mt-3 text-[11px] text-muted-foreground', className)}
        role="status"
      >
        Narración no disponible en este navegador. Podés seguir el tutorial con el texto en
        pantalla.
      </p>
    );
  }

  const isSpeaking = narration.status === 'speaking';
  const isPaused = narration.status === 'paused';

  return (
    <div
      className={cn(
        'mt-3 rounded-md border bg-muted/30 px-2 py-2',
        className
      )}
      role="group"
      aria-label="Controles de narración"
    >
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
            disabled={narration.muted}
            aria-label={isPaused ? 'Reanudar narración' : 'Reproducir narración'}
            title={isPaused ? 'Reanudar' : 'Reproducir'}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {isPaused ? 'Reanudar' : 'Escuchar'}
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={narration.replay}
          disabled={narration.muted}
          aria-label="Repetir paso actual"
          title="Repetir"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Repetir
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={narration.toggleMute}
          aria-label={narration.muted ? 'Activar narración' : 'Silenciar narración'}
          aria-pressed={narration.muted}
          title={narration.muted ? 'Activar voz' : 'Silenciar'}
        >
          {narration.muted ? (
            <VolumeX className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
          )}
          {narration.muted ? 'Sin voz' : 'Voz'}
        </Button>

        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Vel.</span>
          <select
            className="h-8 max-w-[4.5rem] rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
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
      <p className="mt-1 text-[10px] text-muted-foreground" aria-live="polite">
        {narration.muted
          ? 'Narración silenciada'
          : isSpeaking
            ? 'Narrando este paso…'
            : isPaused
              ? 'Narración en pausa'
              : 'Listo para narrar'}
      </p>
    </div>
  );
}
