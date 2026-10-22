import Link from 'next/link';
import { formatMeteredUsage, type ClinicCommercialBanner } from '@sincvete/shared';

function quotaUsageText(banner: ClinicCommercialBanner): string {
  if (banner.quotaUsed == null || banner.quotaLimit == null) return '';
  return ` (${formatMeteredUsage({
    featureKey: banner.quotaFeatureKey ?? '',
    label: banner.quotaLabel ?? '',
    used: banner.quotaUsed,
    limit: banner.quotaLimit,
  })})`;
}

export function ClinicBillingBanner({ banner }: { banner: ClinicCommercialBanner }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
      {banner.kind === 'trial' ? (
        <p>
          Estás en trial{banner.planName ? ` (${banner.planName})` : ''}.
          {banner.trialEndsAt
            ? ` Vence el ${new Date(banner.trialEndsAt).toLocaleDateString('es-AR')}.`
            : ''}{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Elegí un plan
          </Link>
        </p>
      ) : banner.kind === 'past_due' ? (
        <p>
          Hay un pago pendiente{banner.planName ? ` de ${banner.planName}` : ''}. La clínica sigue
          operativa.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Actualizar plan
          </Link>
        </p>
      ) : banner.kind === 'checkout_pending' ? (
        <p>
          Estamos confirmando tu pago. No inicies otro hasta que se acredite.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Ver plan
          </Link>
        </p>
      ) : banner.kind === 'plan_ending' ? (
        <p>
          Tu plan{banner.planName ? ` ${banner.planName}` : ''} vence
          {banner.endsAt ? ` el ${new Date(banner.endsAt).toLocaleDateString('es-AR')}` : ' pronto'}
          . Renovalo para no perder el acceso.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Renovar plan
          </Link>
        </p>
      ) : banner.kind === 'addon_ending' ? (
        <p>
          El extra{banner.addonName ? ` ${banner.addonName}` : ''} vence
          {banner.endsAt ? ` el ${new Date(banner.endsAt).toLocaleDateString('es-AR')}` : ' pronto'}
          . Renovalo para no perder el módulo.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Renovar extra
          </Link>
        </p>
      ) : banner.kind === 'quota_over' ? (
        <p>
          Superaste el cupo
          {banner.quotaLabel ? ` de ${banner.quotaLabel}` : ''}
          {quotaUsageText(banner)}. Subí de plan o reducí el uso.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Ver plan
          </Link>
        </p>
      ) : banner.kind === 'quota_near' ? (
        <p>
          El cupo
          {banner.quotaLabel ? ` de ${banner.quotaLabel}` : ''} está cerca del límite
          {quotaUsageText(banner)}.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Ver plan
          </Link>
        </p>
      ) : (
        <p>
          Tu plan venció{banner.planName ? ` (${banner.planName})` : ''}. Elegí uno para seguir usando
          los módulos.{' '}
          <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
            Ver planes
          </Link>
        </p>
      )}
    </div>
  );
}
