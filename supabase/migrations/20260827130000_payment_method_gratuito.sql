-- Staging-safe: allow "gratuito" as expected / recorded payment method.
-- Reversible notes:
--   - CHECK constraint can be dropped/recreated without gratuito
--   - ENUM values cannot be removed easily in Postgres; leave in place if rolling back app code

ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'gratuito';

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_expected_payment_method_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_expected_payment_method_check
  CHECK (
    expected_payment_method IS NULL
    OR expected_payment_method IN (
      'efectivo',
      'transferencia',
      'tarjeta',
      'mercadopago',
      'gratuito',
      'otro'
    )
  );
