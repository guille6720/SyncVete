BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.purchase_parties ADD COLUMN cuit text;
ALTER TABLE public.purchase_parties ADD CONSTRAINT purchase_parties_cuit_format CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$') NOT VALID;
ALTER TABLE public.purchase_parties VALIDATE CONSTRAINT purchase_parties_cuit_format;
COMMIT;
