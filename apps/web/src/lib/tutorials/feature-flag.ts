/**
 * Academia / interactive tutorials gate.
 * On in Vercel Preview and Production by default.
 * Set NEXT_PUBLIC_ACADEMIA_ENABLED=false to force off; =true to force on.
 */
export function isAcademiaEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ACADEMIA_ENABLED === 'false') return false;
  if (process.env.NEXT_PUBLIC_ACADEMIA_ENABLED === 'true') return true;
  return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'production';
}
