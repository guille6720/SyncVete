'use client';

import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoredVoiceProfile } from '@/lib/tutorials/speech-narration';
import { cn } from '@/lib/utils';

const RATE_OPTIONS = [
  { value: 0.85, label: '0.85× Tranquila' },
  { value: 0.92, label: '0.92× Natural' },
  { value: 0.98, label: '0.98× Ágil' },
  { value: 1.05, label: '1.05× Rápida' },
] as const;

interface TutorialPlaybackBarProps {
  title: string;
  caption?: string | null;
  stepIndex: number;
  totalSteps: number;
  paused: boolean;
  muted: boolean;
  rate: number;
  voiceProfile: StoredVoiceProfile;
  femaleAvailable: boolean;
  maleAvailable: boolean;
  onSeek: (stepIndex: number) => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onRateChange: (rate: number) => void;
  onVoiceProfileChange: (profile: StoredVoiceProfile) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Compact bottom chrome for continuous tutorial playback.
 * Includes speed + masculine/feminine voice selectors.
 */
export function TutorialPlaybackBar({
  title,
  caption,
  stepIndex,
  totalSteps,
  paused,
  muted,
  rate,
  voiceProfile,
  femaleAvailable,
  maleAvailable,
  onSeek,
  onTogglePause,
  onToggleMute,
  onRateChange,
  onVoiceProfileChange,
  onClose,
  className,
}: TutorialPlaybackBarProps) {
  const safeTotal = Math.max(totalSteps, 1);
  const pct = Math.round(((stepIndex + 1) / safeTotal) * 100);
  const rateValue = RATE_OPTIONS.some((option) => option.value === rate)
    ? String(rate)
    : String(RATE_OPTIONS[1].value);

  return (
    <div
      role="region"
      aria-label="Reproducción del tutorial"
      data-tutorial-playback-bar="true"
      className={cn(
        'pointer-events-auto fixed bottom-0 left-0 right-0 z-[70] border-t bg-background/95 shadow-[0_-8px_24px_rgba(15,23,42,0.18)] backdrop-blur-sm',
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Tutoriales · Paso {stepIndex + 1} de {totalSteps}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            {caption ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{caption}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onTogglePause}
              aria-label={paused ? 'Continuar explicación' : 'Pausar explicación'}
            >
              {paused ? (
                <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              ) : (
                <Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {paused ? 'Continuar' : 'Pausar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onToggleMute}
              aria-label={muted ? 'Activar voz' : 'Silenciar voz'}
              aria-pressed={muted}
            >
              {muted ? (
                <VolumeX className="h-4 w-4" aria-hidden />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Cerrar tutorial"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Voz</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
              value={voiceProfile}
              onChange={(event) =>
                onVoiceProfileChange(event.target.value as StoredVoiceProfile)
              }
              aria-label="Perfil de voz"
              disabled={muted}
            >
              <option value="auto">Automática</option>
              <option value="female" disabled={!femaleAvailable}>
                {femaleAvailable ? 'Femenina' : 'Femenina (no disponible)'}
              </option>
              <option value="male" disabled={!maleAvailable}>
                {maleAvailable ? 'Masculina' : 'Masculina (no disponible)'}
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Velocidad</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground"
              value={rateValue}
              onChange={(event) => onRateChange(Number(event.target.value))}
              aria-label="Velocidad de reproducción"
              disabled={muted}
            >
              {RATE_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="sr-only">Progreso del tutorial</span>
          <input
            type="range"
            min={0}
            max={Math.max(totalSteps - 1, 0)}
            step={1}
            value={Math.min(stepIndex, Math.max(totalSteps - 1, 0))}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={stepIndex + 1}
            aria-valuetext={`Paso ${stepIndex + 1} de ${totalSteps}`}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Desplazá para saltar a otro paso</span>
            <span>{pct}%</span>
          </div>
        </label>
      </div>
    </div>
  );
}
