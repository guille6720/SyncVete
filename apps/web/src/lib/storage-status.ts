export const PRELIMINARY_STORAGE_PLANS = [
  { key: 'basic', name: 'Esencial', monthlyArs: 29900, bytes: 2_000_000_000 },
  { key: 'pro', name: 'Profesional', monthlyArs: 49900, bytes: 10_000_000_000 },
  { key: 'premium', name: 'Premium', monthlyArs: 79900, bytes: 30_000_000_000 },
] as const;

export function storageAlert(usedBytes: number, quotaBytes: number | null) {
  if (quotaBytes === null || !Number.isFinite(quotaBytes) || quotaBytes <= 0 || !Number.isFinite(usedBytes) || usedBytes < 0) return 'unknown';
  if (usedBytes >= quotaBytes) return 'full';
  if (usedBytes >= quotaBytes * 0.95) return 'critical';
  if (usedBytes >= quotaBytes * 0.8) return 'warning';
  return 'normal';
}
