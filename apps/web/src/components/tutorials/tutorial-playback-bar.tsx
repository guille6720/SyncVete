'use client';

import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoredVoiceProfile } from '@/lib/tutorials/speech-narration';
import { cn } from '@/lib/utils';

const RATE_OPTIONS = [
  { value: 0.85, label: '0.85× Tranquila' },
  { value: 1, label: '1× Natural' },
  { value: 1.05, label: '1.05× Ágil' },
  { value: 1.12, label: '1.12× Rápida' },
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
  elevenLabsAvailable: boolean;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onRateChange: (rate: number) => void;
  onVoiceProfileChange: (profile: StoredVoiceProfile) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Continuous tutorial chrome: plays by itself.
 * User actions: pause / resume, mute, voice, speed, and close.
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
  elevenLabsAvailable,
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
      aria-label="Reproducción continua del tutorial"
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
              Reproducción continua · Paso {stepIndex + 1} de {totalSteps}
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
              aria-label="Terminar tutorial"
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
              value={voiceProfile === 'horacio' ? 'horacio' : 'brian'}
              onChange={(event) =>
                onVoiceProfileChange(event.target.value as StoredVoiceProfile)
              }
              aria-label="Voz de narración"
              disabled={muted}
            >
              <option value="brian">
                {elevenLabsAvailable ? 'Brian C' : 'Brian · Tomas (gratis)'}
              </option>
              <option value="horacio">
                {elevenLabsAvailable ? 'Horacio' : 'Horacio · Jorge (gratis)'}
              </option>
            </select>
            {!elevenLabsAvailable ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                Voz neural gratuita (Microsoft): Tomas ≈ Brian, Jorge ≈ Horacio.
              </span>
            ) : null}
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

        <div
          className="space-y-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={stepIndex + 1}
          aria-valuetext={`Paso ${stepIndex + 1} de ${totalSteps}`}
          aria-label="Progreso de la reproducción continua"
        >
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Se avanza solo · solo pausá o terminá</span>
            <span>{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
