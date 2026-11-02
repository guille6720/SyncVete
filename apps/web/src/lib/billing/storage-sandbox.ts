import { PRELIMINARY_STORAGE_PLANS } from '@/lib/storage-status';

export function storageSandboxQuote(planKey: string, projectUrl: string | undefined) {
  if (projectUrl !== 'https://owmcrqvnfubyjxrlyhlc.supabase.co') {
    throw new Error('El catálogo de prueba requiere staging');
  }
  const plan = PRELIMINARY_STORAGE_PLANS.find(candidate => candidate.key === planKey);
  if (!plan) throw new Error('Plan de prueba inválido');
  return {
    planKey: plan.key,
    name: plan.name,
    currency: 'ARS' as const,
    interval: 'monthly' as const,
    amountMinor: plan.monthlyArs * 100,
    quotaBytes: plan.bytes,
    simulated: true as const,
    taxTreatment: 'pending' as const,
    checkoutEnabled: false as const,
  };
}
