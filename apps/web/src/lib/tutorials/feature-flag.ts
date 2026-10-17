/**
 * Academia / interactive tutorials gate.
 * Default: disabled. Never enable on Vercel Production even if the env var is set.
 */
export function isAcademiaEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  return process.env.NEXT_PUBLIC_ACADEMIA_ENABLED === 'true';
}
