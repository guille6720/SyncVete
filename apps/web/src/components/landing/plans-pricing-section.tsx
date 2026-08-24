import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  FALLBACK_PUBLIC_PLANS,
  formatArsAmount,
  type PublicPlanCatalogItem,
} from '@sincvete/shared';

export function PlansPricingSection({
  plans = FALLBACK_PUBLIC_PLANS,
}: {
  plans?: PublicPlanCatalogItem[];
}) {
  return (
    <section id="planes" className="scroll-mt-24 border-t border-[var(--land-line)] bg-[var(--land-surface)] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium tracking-wide text-[var(--land-accent)]">Planes</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[var(--land-ink)] md:text-4xl">
            Suscribite y operá hoy
          </h2>
          <p className="mt-4 text-[var(--land-muted)]">
            Precios en pesos argentinos. Creá tu clínica sin tarjeta; el plan se elige después desde Configuración.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const monthly = formatArsAmount(plan.pricing.monthlyAmount);
            return (
              <div
                key={plan.key}
                className={cn(
                  'flex flex-col border p-7',
                  plan.pricing.recommended
                    ? 'border-[var(--land-accent)] bg-[var(--land-ink)] text-white'
                    : 'border-[var(--land-line)] bg-white text-[var(--land-ink)]'
                )}
              >
                {plan.pricing.recommended ? (
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--land-mint)]">
                    Más elegido
                  </p>
                ) : (
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--land-muted)]">
                    {plan.pricing.cta === 'contact' ? 'A medida' : 'Plan comercial'}
                  </p>
                )}

                <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
                <p
                  className={cn(
                    'mt-1 text-sm',
                    plan.pricing.recommended ? 'text-white/70' : 'text-[var(--land-muted)]'
                  )}
                >
                  {plan.description}
                </p>

                <p className="mt-6 font-display text-4xl font-semibold tracking-tight">
                  {monthly ? `$ ${monthly}` : 'Consultar'}
                  {monthly ? (
                    <span
                      className={cn(
                        'text-base font-sans font-normal',
                        plan.pricing.recommended ? 'text-white/55' : 'text-[var(--land-muted)]'
                      )}
                    >
                      {' '}
                      / mes
                    </span>
                  ) : null}
                </p>
                {plan.pricing.annualAmount ? (
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      plan.pricing.recommended ? 'text-white/50' : 'text-[var(--land-muted)]'
                    )}
                  >
                    Anual $ {formatArsAmount(plan.pricing.annualAmount)} · 2 meses bonificados
                  </p>
                ) : (
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      plan.pricing.recommended ? 'text-white/50' : 'text-[var(--land-muted)]'
                    )}
                  >
                    Contrato y cupos personalizados
                  </p>
                )}

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.pricing.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-sm leading-snug">
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          plan.pricing.recommended ? 'text-[var(--land-mint)]' : 'text-[var(--land-accent)]'
                        )}
                      />
                      <span className={plan.pricing.recommended ? 'text-white/85' : 'text-[var(--land-ink)]/80'}>
                        {h}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  size="lg"
                  className={cn(
                    'mt-8 h-12 w-full rounded-none text-base font-semibold',
                    plan.pricing.recommended
                      ? 'bg-[var(--land-mint)] text-[var(--land-ink)] hover:bg-white'
                      : 'bg-[var(--land-accent)] text-white hover:bg-[var(--land-ink)]'
                  )}
                  asChild
                >
                  <Link href="/register">
                    {plan.pricing.cta === 'contact' ? 'Hablar con ventas' : 'Empezar 10 días gratis'}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
