'use client';

import { BrandLogo } from '@/components/brand/syncvete-logo';
import { cn } from '@/lib/utils';

interface TutorialIntroLogoProps {
  visible: boolean;
  reducedMotion: boolean;
  /** Closing outro variant uses a shorter caption. */
  variant?: 'intro' | 'outro';
  onSkip?: () => void;
  className?: string;
}

/**
 * Animated SyncVete logo intro / outro for Academia demos.
 * Purely visual — never touches clinic data.
 */
export function TutorialIntroLogo({
  visible,
  reducedMotion,
  variant = 'intro',
  onSkip,
  className,
}: TutorialIntroLogoProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm',
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="academia-intro-title"
      data-tutorial-intro={variant}
    >
      <div
        className={cn(
          'flex max-w-md flex-col items-center gap-4 text-center',
          reducedMotion ? '' : 'sv-tutorial-intro-enter'
        )}
      >
        <BrandLogo size="lg" variant="onDark" priority className="shadow-2xl" />
        <div>
          <p
            id="academia-intro-title"
            className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-white"
          >
            Tutoriales SyncVete
          </p>
          <p className="mt-1 text-sm text-slate-200">
            {variant === 'outro'
              ? 'Ya podés practicar la Agenda cuando quieras.'
              : 'Agenda — demostración guiada con datos ficticios'}
          </p>
        </div>
        <p className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-100">
          Sin guardar datos reales
        </p>
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 text-xs font-medium text-slate-200 underline-offset-2 hover:underline"
          >
            {variant === 'outro' ? 'Finalizar' : 'Saltar introducción'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
