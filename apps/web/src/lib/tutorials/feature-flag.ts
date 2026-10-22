/**
 * Academia / interactive tutorials gate.
 * On in Vercel Preview, and whenever NEXT_PUBLIC_ACADEMIA_ENABLED=true.
 * Never on Vercel Production.
 */
export function isAcademiaEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.NEXT_PUBLIC_ACADEMIA_ENABLED === 'true') return true;
  return process.env.VERCEL_ENV === 'preview';
}
