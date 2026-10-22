'use client';

import { useMemo } from 'react';
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
  const profileHint = useMemo(() => {
    if (!narration.supported) return null;
    const { availability, voiceProfile } = narration;
    if (voiceProfile === 'female' && availability.female.length === 0) {
      return 'No hay una voz femenina identificable en este navegador. Elegí Automática o Masculina si está disponible.';
    }
    if (voiceProfile === 'male' && availability.male.length === 0) {
      return 'No hay una voz masculina identificable en este navegador. Elegí Automática o Femenina si está disponible.';
    }
    if (availability.female.length === 0 && availability.male.length === 0) {
      return 'Este navegador no expone voces con género confiable. Usá Automática (voz del sistema en español, sin etiqueta de género).';
    }
    return null;
  }, [narration]);

  if (!narration.supported) {
    return (
      <p
        className={cn('mt-1 text-[11px] text-muted-foreground', className)}
        role="status"
      >
        Narración no disponible en este navegador. Podés seguir el tutorial con el texto en
        pantalla.
      </p>
    );
  }

  const isSpeaking = narration.status === 'speaking';
  const isPaused = narration.status === 'paused';
  const femaleOk = narration.availability.female.length > 0;
  const maleOk = narration.availability.male.length > 0;

  return (
    <div
      className={cn('rounded-md border bg-muted/30 px-2 py-2', className)}
      role="group"
      aria-label="Controles de narración"
    >
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>Voz</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
            value={narration.voiceProfile}
            onChange={(event) =>
              narration.setVoiceProfile(
                event.target.value as TutorialNarrationApi['voiceProfile']
              )
            }
            aria-label="Perfil de voz"
            disabled={narration.muted}
          >
            <option value="auto">Automática (sin género)</option>
            <option value="female" disabled={!femaleOk}>
              {femaleOk ? 'Femenina' : 'Femenina (no disponible)'}
            </option>
            <option value="male" disabled={!maleOk}>
              {maleOk ? 'Masculina' : 'Masculina (no disponible)'}
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
            disabled={narration.muted || Boolean(profileHint && narration.voiceProfile !== 'auto')}
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
          disabled={narration.muted || Boolean(profileHint && narration.voiceProfile !== 'auto')}
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
          onClick={narration.preview}
          disabled={narration.muted || Boolean(profileHint && narration.voiceProfile !== 'auto')}
          aria-label="Vista previa de la voz"
          title="Probar voz"
        >
          Probar
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
      </div>

      {profileHint ? (
        <p className="mt-2 text-[10px] leading-snug text-amber-700 dark:text-amber-300" role="status">
          {profileHint}
        </p>
      ) : null}

      <p className="mt-1 text-[10px] text-muted-foreground" aria-live="polite">
        {narration.muted
          ? 'Narración silenciada'
          : isSpeaking
            ? narration.activeSource === 'prerecorded'
              ? 'Reproduciendo audio profesional…'
              : 'Narrando este paso…'
            : isPaused
              ? 'Narración en pausa'
              : 'Listo para narrar'}
      </p>
    </div>
  );
}
