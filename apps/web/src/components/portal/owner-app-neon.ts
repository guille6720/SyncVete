import { cn } from '@/lib/utils';

/** Distinct neon tones — vivid in light mode, glowing in dark mode. */
export const OWNER_APP_NEON_TONES = [
  'emerald',
  'cyan',
  'violet',
  'amber',
  'rose',
  'sky',
] as const;

export type OwnerAppNeonTone = (typeof OWNER_APP_NEON_TONES)[number];

const NEON_CARD: Record<OwnerAppNeonTone, string> = {
  emerald:
    'border-2 border-emerald-500 bg-card text-foreground shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_16px_rgba(16,185,129,0.35)] hover:border-emerald-400 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.4),0_0_24px_rgba(16,185,129,0.5)] dark:border-emerald-400 dark:shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_22px_rgba(52,211,153,0.55)]',
  cyan: 'border-2 border-cyan-500 bg-card text-foreground shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_0_16px_rgba(6,182,212,0.35)] hover:border-cyan-400 hover:shadow-[0_0_0_1px_rgba(6,182,212,0.4),0_0_24px_rgba(6,182,212,0.5)] dark:border-cyan-400 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_0_22px_rgba(34,211,238,0.55)]',
  violet:
    'border-2 border-violet-500 bg-card text-foreground shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_0_16px_rgba(139,92,246,0.35)] hover:border-violet-400 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_0_24px_rgba(139,92,246,0.5)] dark:border-violet-400 dark:shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_0_22px_rgba(167,139,250,0.55)]',
  amber:
    'border-2 border-amber-500 bg-card text-foreground shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_0_16px_rgba(245,158,11,0.35)] hover:border-amber-400 hover:shadow-[0_0_0_1px_rgba(245,158,11,0.4),0_0_24px_rgba(245,158,11,0.5)] dark:border-amber-400 dark:shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_0_22px_rgba(251,191,36,0.55)]',
  rose: 'border-2 border-rose-500 bg-card text-foreground shadow-[0_0_0_1px_rgba(244,63,94,0.25),0_0_16px_rgba(244,63,94,0.35)] hover:border-rose-400 hover:shadow-[0_0_0_1px_rgba(244,63,94,0.4),0_0_24px_rgba(244,63,94,0.5)] dark:border-rose-400 dark:shadow-[0_0_0_1px_rgba(251,113,133,0.35),0_0_22px_rgba(251,113,133,0.55)]',
  sky: 'border-2 border-sky-500 bg-card text-foreground shadow-[0_0_0_1px_rgba(14,165,233,0.25),0_0_16px_rgba(14,165,233,0.35)] hover:border-sky-400 hover:shadow-[0_0_0_1px_rgba(14,165,233,0.4),0_0_24px_rgba(14,165,233,0.5)] dark:border-sky-400 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_0_22px_rgba(56,189,248,0.55)]',
};

const NEON_ICON: Record<OwnerAppNeonTone, string> = {
  emerald: 'text-emerald-600 drop-shadow-[0_0_8px_rgba(16,185,129,0.65)] dark:text-emerald-400',
  cyan: 'text-cyan-600 drop-shadow-[0_0_8px_rgba(6,182,212,0.65)] dark:text-cyan-400',
  violet: 'text-violet-600 drop-shadow-[0_0_8px_rgba(139,92,246,0.65)] dark:text-violet-400',
  amber: 'text-amber-600 drop-shadow-[0_0_8px_rgba(245,158,11,0.65)] dark:text-amber-400',
  rose: 'text-rose-600 drop-shadow-[0_0_8px_rgba(244,63,94,0.65)] dark:text-rose-400',
  sky: 'text-sky-600 drop-shadow-[0_0_8px_rgba(14,165,233,0.65)] dark:text-sky-400',
};

const NEON_BUTTON =
  'border-2 border-white/90 bg-white/20 text-primary-foreground shadow-[0_0_14px_rgba(255,255,255,0.45)] backdrop-blur transition hover:bg-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.6)] dark:border-emerald-200/90 dark:shadow-[0_0_16px_rgba(167,243,208,0.45)]';

const NEON_HERO =
  'ring-2 ring-emerald-300/70 shadow-[0_0_28px_rgba(16,185,129,0.45)] dark:ring-emerald-400/60 dark:shadow-[0_0_32px_rgba(52,211,153,0.55)]';

export function ownerAppNeonCard(tone: OwnerAppNeonTone, className?: string) {
  return cn(NEON_CARD[tone], 'transition', className);
}

export function ownerAppNeonIcon(tone: OwnerAppNeonTone, className?: string) {
  return cn(NEON_ICON[tone], className);
}

export function ownerAppNeonButton(className?: string) {
  return cn(NEON_BUTTON, className);
}

export function ownerAppNeonHero(className?: string) {
  return cn(NEON_HERO, className);
}

export function ownerAppNeonToneAt(index: number): OwnerAppNeonTone {
  return OWNER_APP_NEON_TONES[index % OWNER_APP_NEON_TONES.length];
}
