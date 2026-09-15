/** Runtime env (dynamic key) so Next.js does not bake `undefined` at build time. */
export function readServerEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string') return '';
  let trimmed = value.trim();
  // Vercel/UI paste often wraps secrets in quotes; Supabase treats them as part of the key.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
