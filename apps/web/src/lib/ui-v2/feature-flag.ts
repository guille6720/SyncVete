/**
 * SyncVete UI V2 (shell + dashboard) — off by default.
 * Set NEXT_PUBLIC_UI_V2_ENABLED=true to enable; =false to force off.
 * Legacy shell remains the fallback when disabled.
 */
export function isUiV2Enabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.NEXT_PUBLIC_UI_V2_ENABLED === 'false') return false;
  if (env.NEXT_PUBLIC_UI_V2_ENABLED === 'true') return true;
  return false;
}
