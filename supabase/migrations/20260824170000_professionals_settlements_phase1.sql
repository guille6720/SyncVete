-- Professionals & Settlements Phase 1: compensation schemes and settlement workflow.
-- STAGING ONLY. Additive migration.
--
-- IMPORTANT: This module tracks clinic-to-professional settlement amounts for operational
-- compensation tracking. It is NOT payroll, tax withholding, or legal employment compliance.
--
-- Rounding strategy: public.round_ars() applies half-up rounding to 2 decimal places at
-- each settlement line. Settlement totals sum already-rounded line amounts (not re-rounded).

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'professional_relationship_type') THEN
    CREATE TYPE public.professional_relationship_type AS ENUM (
      'employee',
      'independent',
      'partner',
      'other'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compensation_rule_type') THEN
    CREATE TYPE public.compensation_rule_type AS ENUM (
      'fixed',
      'activity',
      'percentage'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compensation_frequency') THEN
    CREATE TYPE public.compensation_frequency AS ENUM (
      'monthly',
      'biweekly',
      'weekly',
      'daily',
      'hourly',
      'per_consultation',
      'per_procedure',
      'per_surgery',
      'per_shift',
      'percentage',
      'mixed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status') THEN
    CREATE TYPE public.settlement_status AS ENUM (
      'draft',
      'review',
      'approved',
      'partially_paid',
      'paid',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_item_source_type') THEN
    CREATE TYPE public.settlement_item_source_type AS ENUM (
      'appointment',
      'consultation',
      'surgery',
      'procedure',
      'shift',
      'manual_adjustment',
      'fixed_compensation'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_adjustment_type') THEN
    CREATE TYPE public.settlement_adjustment_type AS ENUM (
      'bonus',
      'deduction',
      'correction',
      'other'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.user_role;
  custom_perms JSONB;
  role_perms TEXT[];
BEGIN
  SELECT bm.role, bm.permissions
  INTO user_role, custom_perms
  FROM public.branch_members bm
  WHERE bm.user_id = auth.uid()
    AND bm.deleted_at IS NULL
    AND bm.is_active = true
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  IF custom_perms IS NOT NULL AND jsonb_array_length(custom_perms) > 0 THEN
    RETURN custom_perms ? required_permission;
  END IF;

  role_perms := CASE user_role
    WHEN 'owner' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay'
    ]
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export','waiting_room:read','waiting_room:write'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read','waiting_room:write'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send','waiting_room:read','waiting_room:write'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'professional_settlements:read','professional_settlements:pay'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read','waiting_room:read'
    ]
    ELSE ARRAY[]::TEXT[]
  END;

  RETURN required_permission = ANY(role_perms);
END;
$$;

-- ─────────────────────────────────────────────
-- Feature catalog
-- ─────────────────────────────────────────────
INSERT INTO public.features (key, name, description, feature_type, default_enabled, usage_metered)
VALUES (
  'professionals.settlements',
  'Liquidaciones a profesionales',
  'Esquemas de compensación y liquidaciones operativas a profesionales',
  'boolean',
  true,
  false
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_enabled = EXCLUDED.default_enabled,
  usage_metered = EXCLUDED.usage_metered,
  is_active = true,
  updated_at = now();

INSERT INTO public.plan_features (plan_id, feature_id, enabled, limit_value)
SELECT p.id, f.id, true, NULL
FROM public.plans p
CROSS JOIN public.features f
WHERE p.is_active
  AND f.key = 'professionals.settlements'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();

-- ─────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.round_ars(n NUMERIC)
RETURNS NUMERIC(14, 2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(COALESCE(n, 0)::NUMERIC, 2)::NUMERIC(14, 2);
$$;

COMMENT ON FUNCTION public.round_ars(NUMERIC) IS
  'ARS monetary rounding: half-up to 2 decimals at each settlement line.';

CREATE OR REPLACE FUNCTION public.professional_activity_occurred_on(
  p_completed_at TIMESTAMPTZ,
  p_updated_at TIMESTAMPTZ,
  p_created_at TIMESTAMPTZ
)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_completed_at, p_updated_at, p_created_at)::DATE;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_professional_settlement_totals(p_settlement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross NUMERIC(14, 2) := 0;
  v_adjustments NUMERIC(14, 2) := 0;
  v_deductions NUMERIC(14, 2) := 0;
  v_total NUMERIC(14, 2) := 0;
  v_total_paid NUMERIC(14, 2) := 0;
  v_balance NUMERIC(14, 2) := 0;
BEGIN
  SELECT COALESCE(SUM(i.calculated_amount), 0)
  INTO v_gross
  FROM public.professional_settlement_items i
  WHERE i.settlement_id = p_settlement_id;

  SELECT
    COALESCE(SUM(CASE WHEN a.adjustment_type IN ('bonus', 'correction', 'other') THEN a.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN a.adjustment_type = 'deduction' THEN a.amount ELSE 0 END), 0)
  INTO v_adjustments, v_deductions
  FROM public.professional_settlement_adjustments a
  WHERE a.settlement_id = p_settlement_id;

  v_total := public.round_ars(v_gross + v_adjustments - v_deductions);

  SELECT COALESCE(s.total_paid, 0)
  INTO v_total_paid
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id;

  v_balance := public.round_ars(v_total - v_total_paid);

  UPDATE public.professional_settlements s
  SET
    gross_amount = v_gross,
    adjustments_amount = v_adjustments,
    deductions_amount = v_deductions,
    total_amount = v_total,
    balance_due = v_balance,
    updated_at = now()
  WHERE s.id = p_settlement_id;
END;
$$;

-- ─────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 100),
  last_name TEXT NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 100),
  document_number TEXT CHECK (document_number IS NULL OR char_length(document_number) <= 50),
  tax_id TEXT CHECK (tax_id IS NULL OR char_length(tax_id) <= 50),
  professional_license TEXT CHECK (professional_license IS NULL OR char_length(professional_license) <= 80),
  professional_license_jurisdiction TEXT CHECK (professional_license_jurisdiction IS NULL OR char_length(professional_license_jurisdiction) <= 80),
  specialty TEXT CHECK (specialty IS NULL OR char_length(specialty) <= 120),
  relationship_type public.professional_relationship_type NOT NULL,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  invoice_required BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT professionals_end_after_start CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS idx_professionals_org
  ON public.professionals (organization_id, last_name, first_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professionals_user
  ON public.professionals (organization_id, user_id)
  WHERE deleted_at IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_professionals_profile
  ON public.professionals (organization_id, profile_id)
  WHERE deleted_at IS NULL AND profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.professional_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_branches_active
  ON public.professional_branches (professional_id, branch_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_branches_branch
  ON public.professional_branches (organization_id, branch_id)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS public.professional_compensation_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  valid_from DATE NOT NULL,
  valid_to DATE,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (char_length(currency) = 3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT professional_compensation_schemes_valid_range CHECK (
    valid_to IS NULL OR valid_to >= valid_from
  )
);

CREATE INDEX IF NOT EXISTS idx_professional_compensation_schemes_professional
  ON public.professional_compensation_schemes (organization_id, professional_id, valid_from DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.professional_compensation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  compensation_scheme_id UUID NOT NULL REFERENCES public.professional_compensation_schemes(id) ON DELETE RESTRICT,
  rule_type public.compensation_rule_type NOT NULL,
  frequency public.compensation_frequency NOT NULL,
  amount NUMERIC(14, 2) CHECK (amount IS NULL OR amount >= 0),
  percentage NUMERIC(5, 2) CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  activity_type TEXT CHECK (activity_type IS NULL OR char_length(activity_type) <= 80),
  minimum_amount NUMERIC(14, 2) CHECK (minimum_amount IS NULL OR minimum_amount >= 0),
  maximum_amount NUMERIC(14, 2) CHECK (maximum_amount IS NULL OR maximum_amount >= 0),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT professional_compensation_rules_min_max CHECK (
    minimum_amount IS NULL
    OR maximum_amount IS NULL
    OR maximum_amount >= minimum_amount
  ),
  CONSTRAINT professional_compensation_rules_values CHECK (
    (rule_type = 'percentage' AND percentage IS NOT NULL)
    OR (rule_type IN ('fixed', 'activity') AND amount IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_professional_compensation_rules_scheme
  ON public.professional_compensation_rules (compensation_scheme_id)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS public.professional_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  compensation_scheme_id UUID NOT NULL REFERENCES public.professional_compensation_schemes(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status public.settlement_status NOT NULL DEFAULT 'draft',
  gross_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  adjustments_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (adjustments_amount >= 0),
  deductions_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (deductions_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_paid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (char_length(currency) = 3),
  notes TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT professional_settlements_period_range CHECK (period_end >= period_start),
  CONSTRAINT professional_settlements_paid_not_over_total CHECK (total_paid <= total_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_settlements_active_period
  ON public.professional_settlements (
    organization_id,
    professional_id,
    period_start,
    period_end,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE deleted_at IS NULL AND status NOT IN ('cancelled');

CREATE INDEX IF NOT EXISTS idx_professional_settlements_org_status
  ON public.professional_settlements (organization_id, status, period_end DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_settlements_professional
  ON public.professional_settlements (organization_id, professional_id, period_start DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.professional_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.professional_settlements(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  rule_id UUID REFERENCES public.professional_compensation_rules(id) ON DELETE SET NULL,
  source_type public.settlement_item_source_type NOT NULL,
  source_id UUID,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount NUMERIC(14, 2) CHECK (unit_amount IS NULL OR unit_amount >= 0),
  percentage NUMERIC(5, 2) CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  base_amount NUMERIC(14, 2) CHECK (base_amount IS NULL OR base_amount >= 0),
  calculated_amount NUMERIC(14, 2) NOT NULL CHECK (calculated_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professional_settlement_items_settlement
  ON public.professional_settlement_items (settlement_id, created_at);

CREATE TABLE IF NOT EXISTS public.professional_settlement_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.professional_settlements(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  adjustment_type public.settlement_adjustment_type NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professional_settlement_adjustments_settlement
  ON public.professional_settlement_adjustments (settlement_id, created_at);

CREATE TABLE IF NOT EXISTS public.professional_settlement_source_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_type public.settlement_item_source_type NOT NULL,
  source_id UUID NOT NULL,
  settlement_id UUID NOT NULL REFERENCES public.professional_settlements(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_settlement_source_claims_settlement
  ON public.professional_settlement_source_claims (settlement_id);

CREATE TABLE IF NOT EXISTS public.professional_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES public.professional_settlements(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (char_length(currency) = 3),
  method public.payment_method NOT NULL DEFAULT 'efectivo',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference TEXT CHECK (reference IS NULL OR char_length(reference) <= 120),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  invoice_number TEXT CHECK (invoice_number IS NULL OR char_length(invoice_number) <= 80),
  invoice_date DATE,
  invoice_amount NUMERIC(14, 2) CHECK (invoice_amount IS NULL OR invoice_amount >= 0),
  invoice_attachment_url TEXT CHECK (invoice_attachment_url IS NULL OR char_length(invoice_attachment_url) <= 500),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_professional_payments_settlement
  ON public.professional_payments (settlement_id, paid_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_payments_professional
  ON public.professional_payments (organization_id, professional_id, paid_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.professionals IS
  'Clinic professionals for operational compensation tracking. Not payroll/tax compliance.';
COMMENT ON TABLE public.professional_settlements IS
  'Period settlements to professionals. Amounts use round_ars() per line; totals sum rounded lines.';
COMMENT ON TABLE public.professional_settlement_source_claims IS
  'Prevents the same clinical/billing source from being settled twice across approved settlements.';

-- ─────────────────────────────────────────────
-- Triggers: updated_at + audit
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_professionals_updated_at ON public.professionals;
CREATE TRIGGER trg_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professionals ON public.professionals;
CREATE TRIGGER trg_audit_professionals
  AFTER INSERT OR UPDATE OR DELETE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_professional_branches_updated_at ON public.professional_branches;
CREATE TRIGGER trg_professional_branches_updated_at
  BEFORE UPDATE ON public.professional_branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_branches ON public.professional_branches;
CREATE TRIGGER trg_audit_professional_branches
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_branches
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_professional_compensation_schemes_updated_at ON public.professional_compensation_schemes;
CREATE TRIGGER trg_professional_compensation_schemes_updated_at
  BEFORE UPDATE ON public.professional_compensation_schemes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_compensation_schemes ON public.professional_compensation_schemes;
CREATE TRIGGER trg_audit_professional_compensation_schemes
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_compensation_schemes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_professional_compensation_rules_updated_at ON public.professional_compensation_rules;
CREATE TRIGGER trg_professional_compensation_rules_updated_at
  BEFORE UPDATE ON public.professional_compensation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_compensation_rules ON public.professional_compensation_rules;
CREATE TRIGGER trg_audit_professional_compensation_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_compensation_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_professional_settlements_updated_at ON public.professional_settlements;
CREATE TRIGGER trg_professional_settlements_updated_at
  BEFORE UPDATE ON public.professional_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_settlements ON public.professional_settlements;
CREATE TRIGGER trg_audit_professional_settlements
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_settlements
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_professional_payments_updated_at ON public.professional_payments;
CREATE TRIGGER trg_professional_payments_updated_at
  BEFORE UPDATE ON public.professional_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_professional_payments ON public.professional_payments;
CREATE TRIGGER trg_audit_professional_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- Immutable settlement lines after approval/payment
CREATE OR REPLACE FUNCTION public.prevent_locked_professional_settlement_item_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.settlement_status;
  v_settlement_id UUID;
BEGIN
  v_settlement_id := COALESCE(OLD.settlement_id, NEW.settlement_id);

  SELECT s.status
  INTO v_status
  FROM public.professional_settlements s
  WHERE s.id = v_settlement_id;

  IF v_status IN ('approved', 'partially_paid', 'paid') THEN
    RAISE EXCEPTION 'No se pueden modificar ítems de una liquidación aprobada o pagada';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_professional_settlement_items_update ON public.professional_settlement_items;
CREATE TRIGGER trg_prevent_locked_professional_settlement_items_update
  BEFORE UPDATE ON public.professional_settlement_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_professional_settlement_item_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_professional_settlement_items_delete ON public.professional_settlement_items;
CREATE TRIGGER trg_prevent_locked_professional_settlement_items_delete
  BEFORE DELETE ON public.professional_settlement_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_professional_settlement_item_mutation();

CREATE OR REPLACE FUNCTION public.prevent_locked_professional_settlement_adjustment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.settlement_status;
  v_settlement_id UUID;
BEGIN
  v_settlement_id := COALESCE(OLD.settlement_id, NEW.settlement_id);

  SELECT s.status
  INTO v_status
  FROM public.professional_settlements s
  WHERE s.id = v_settlement_id;

  IF v_status IN ('approved', 'partially_paid', 'paid') THEN
    RAISE EXCEPTION 'No se pueden modificar ajustes de una liquidación aprobada o pagada';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_professional_settlement_adjustments_update ON public.professional_settlement_adjustments;
CREATE TRIGGER trg_prevent_locked_professional_settlement_adjustments_update
  BEFORE UPDATE ON public.professional_settlement_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_professional_settlement_adjustment_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_professional_settlement_adjustments_delete ON public.professional_settlement_adjustments;
CREATE TRIGGER trg_prevent_locked_professional_settlement_adjustments_delete
  BEFORE DELETE ON public.professional_settlement_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_professional_settlement_adjustment_mutation();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professionals_select_tenant ON public.professionals;
CREATE POLICY professionals_select_tenant ON public.professionals
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professionals:read')
  );

DROP POLICY IF EXISTS professionals_insert_tenant ON public.professionals;
CREATE POLICY professionals_insert_tenant ON public.professionals
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professionals:write')
  );

DROP POLICY IF EXISTS professionals_update_tenant ON public.professionals;
CREATE POLICY professionals_update_tenant ON public.professionals
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professionals:write')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professionals:write')
  );

ALTER TABLE public.professional_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_branches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_branches_select_tenant ON public.professional_branches;
CREATE POLICY professional_branches_select_tenant ON public.professional_branches
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professionals:read')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS professional_branches_insert_tenant ON public.professional_branches;
CREATE POLICY professional_branches_insert_tenant ON public.professional_branches
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professionals:write')
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS professional_branches_update_tenant ON public.professional_branches;
CREATE POLICY professional_branches_update_tenant ON public.professional_branches
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professionals:write')
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professionals:write')
    AND public.user_has_branch_access(branch_id)
  );

ALTER TABLE public.professional_compensation_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_compensation_schemes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_compensation_schemes_select_tenant ON public.professional_compensation_schemes;
CREATE POLICY professional_compensation_schemes_select_tenant ON public.professional_compensation_schemes
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_compensation:read')
  );

DROP POLICY IF EXISTS professional_compensation_schemes_insert_tenant ON public.professional_compensation_schemes;
CREATE POLICY professional_compensation_schemes_insert_tenant ON public.professional_compensation_schemes
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
  );

DROP POLICY IF EXISTS professional_compensation_schemes_update_tenant ON public.professional_compensation_schemes;
CREATE POLICY professional_compensation_schemes_update_tenant ON public.professional_compensation_schemes
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_compensation:write')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
  );

ALTER TABLE public.professional_compensation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_compensation_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_compensation_rules_select_tenant ON public.professional_compensation_rules;
CREATE POLICY professional_compensation_rules_select_tenant ON public.professional_compensation_rules
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_compensation:read')
  );

DROP POLICY IF EXISTS professional_compensation_rules_insert_tenant ON public.professional_compensation_rules;
CREATE POLICY professional_compensation_rules_insert_tenant ON public.professional_compensation_rules
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
  );

DROP POLICY IF EXISTS professional_compensation_rules_update_tenant ON public.professional_compensation_rules;
CREATE POLICY professional_compensation_rules_update_tenant ON public.professional_compensation_rules
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_compensation:write')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
  );

ALTER TABLE public.professional_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_settlements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_settlements_select_tenant ON public.professional_settlements;
CREATE POLICY professional_settlements_select_tenant ON public.professional_settlements
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_settlements:read')
    AND (
      branch_id IS NULL
      OR public.user_has_branch_access(branch_id)
    )
  );

DROP POLICY IF EXISTS professional_settlements_insert_tenant ON public.professional_settlements;
CREATE POLICY professional_settlements_insert_tenant ON public.professional_settlements
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_settlements:read')
    AND public.has_permission('professional_compensation:write')
    AND (
      branch_id IS NULL
      OR public.user_has_branch_access(branch_id)
    )
  );

DROP POLICY IF EXISTS professional_settlements_update_tenant ON public.professional_settlements;
CREATE POLICY professional_settlements_update_tenant ON public.professional_settlements
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND (
      public.has_permission('professional_settlements:approve')
      OR public.has_permission('professional_settlements:pay')
      OR public.has_permission('professional_compensation:write')
    )
    AND (
      branch_id IS NULL
      OR public.user_has_branch_access(branch_id)
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      branch_id IS NULL
      OR public.user_has_branch_access(branch_id)
    )
  );

ALTER TABLE public.professional_settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_settlement_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_settlement_items_select_tenant ON public.professional_settlement_items;
CREATE POLICY professional_settlement_items_select_tenant ON public.professional_settlement_items
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_items.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

ALTER TABLE public.professional_settlement_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_settlement_adjustments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_settlement_adjustments_select_tenant ON public.professional_settlement_adjustments;
CREATE POLICY professional_settlement_adjustments_select_tenant ON public.professional_settlement_adjustments
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_adjustments.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

ALTER TABLE public.professional_settlement_source_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_settlement_source_claims FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_settlement_source_claims_select_tenant ON public.professional_settlement_source_claims;
CREATE POLICY professional_settlement_source_claims_select_tenant ON public.professional_settlement_source_claims
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_source_claims.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

ALTER TABLE public.professional_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_payments_select_tenant ON public.professional_payments;
CREATE POLICY professional_payments_select_tenant ON public.professional_payments
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_payments.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

DROP POLICY IF EXISTS professional_payments_insert_tenant ON public.professional_payments;
CREATE POLICY professional_payments_insert_tenant ON public.professional_payments
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_settlements:pay')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_payments.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

-- ─────────────────────────────────────────────
-- RPC: calculate_professional_settlement
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_professional_settlement(
  p_professional_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_prof public.professionals%ROWTYPE;
  v_scheme public.professional_compensation_schemes%ROWTYPE;
  v_settlement_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_rule public.professional_compensation_rules%ROWTYPE;
  v_overlap_start DATE;
  v_overlap_end DATE;
  v_month_cursor DATE;
  v_month_start DATE;
  v_month_end DATE;
  v_days_in_month INTEGER;
  v_overlap_days INTEGER;
  v_line_amount NUMERIC(14, 2);
  v_count BIGINT;
  v_weeks NUMERIC;
  v_days INTEGER;
  v_anchor DATE;
  v_period_days INTEGER;
  v_window_start DATE;
  v_window_end DATE;
  v_biweekly_count INTEGER;
  v_cons RECORD;
  v_calc NUMERIC(14, 2);
  v_base NUMERIC(14, 2);
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para calcular liquidaciones';
  END IF;

  IF p_professional_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'professional_id, period_start y period_end son requeridos';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end debe ser >= period_start';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal indicada';
  END IF;

  SELECT *
  INTO v_prof
  FROM public.professionals p
  WHERE p.id = p_professional_id
    AND p.organization_id = v_org_id
    AND p.deleted_at IS NULL
    AND p.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profesional no encontrado o inactivo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.professional_settlements s
    WHERE s.organization_id = v_org_id
      AND s.professional_id = p_professional_id
      AND s.period_start = p_period_start
      AND s.period_end = p_period_end
      AND COALESCE(s.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.deleted_at IS NULL
      AND s.status IN ('approved', 'partially_paid', 'paid')
  ) THEN
    RAISE EXCEPTION 'Ya existe una liquidación aprobada o pagada para este período';
  END IF;

  SELECT *
  INTO v_scheme
  FROM public.professional_compensation_schemes cs
  WHERE cs.organization_id = v_org_id
    AND cs.professional_id = p_professional_id
    AND cs.deleted_at IS NULL
    AND cs.is_active = true
    AND cs.valid_from <= p_period_end
    AND (cs.valid_to IS NULL OR cs.valid_to >= p_period_start)
  ORDER BY cs.valid_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay esquema de compensación activo para el período';
  END IF;

  SELECT s.*
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.organization_id = v_org_id
    AND s.professional_id = p_professional_id
    AND s.period_start = p_period_start
    AND s.period_end = p_period_end
    AND COALESCE(s.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND s.deleted_at IS NULL
    AND s.status IN ('draft', 'review')
  FOR UPDATE;

  IF FOUND THEN
    v_settlement_id := v_settlement.id;

    DELETE FROM public.professional_settlement_source_claims c
    WHERE c.settlement_id = v_settlement_id;

    DELETE FROM public.professional_settlement_items i
    WHERE i.settlement_id = v_settlement_id;

    UPDATE public.professional_settlements s
    SET
      compensation_scheme_id = v_scheme.id,
      currency = v_scheme.currency,
      calculated_at = now(),
      status = 'draft',
      updated_at = now()
    WHERE s.id = v_settlement_id;
  ELSE
    INSERT INTO public.professional_settlements (
      organization_id,
      branch_id,
      professional_id,
      compensation_scheme_id,
      period_start,
      period_end,
      status,
      currency,
      calculated_at
    ) VALUES (
      v_org_id,
      p_branch_id,
      p_professional_id,
      v_scheme.id,
      p_period_start,
      p_period_end,
      'draft',
      v_scheme.currency,
      now()
    )
    RETURNING id INTO v_settlement_id;
  END IF;

  v_overlap_start := GREATEST(p_period_start, v_scheme.valid_from);
  v_overlap_end := LEAST(p_period_end, COALESCE(v_scheme.valid_to, p_period_end));

  IF v_overlap_end < v_overlap_start THEN
    PERFORM public.recalculate_professional_settlement_totals(v_settlement_id);
    RETURN v_settlement_id;
  END IF;

  FOR v_rule IN
    SELECT r.*
    FROM public.professional_compensation_rules r
    WHERE r.compensation_scheme_id = v_scheme.id
      AND r.organization_id = v_org_id
      AND r.deleted_at IS NULL
      AND r.is_active = true
    ORDER BY r.created_at ASC
  LOOP
    IF v_rule.frequency = 'monthly'
      AND v_rule.rule_type = 'fixed'
      AND v_rule.amount IS NOT NULL THEN
      v_month_cursor := date_trunc('month', v_overlap_start)::DATE;

      WHILE v_month_cursor <= v_overlap_end LOOP
        v_month_start := date_trunc('month', v_month_cursor)::DATE;
        v_month_end := (date_trunc('month', v_month_cursor) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', v_month_cursor) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
        v_overlap_days := LEAST(v_overlap_end, v_month_end) - GREATEST(v_overlap_start, v_month_start) + 1;

        IF v_overlap_days > 0 THEN
          v_line_amount := public.round_ars(v_rule.amount * v_overlap_days::NUMERIC / v_days_in_month::NUMERIC);

          INSERT INTO public.professional_settlement_items (
            settlement_id,
            organization_id,
            rule_id,
            source_type,
            description,
            quantity,
            unit_amount,
            calculated_amount
          ) VALUES (
            v_settlement_id,
            v_org_id,
            v_rule.id,
            'fixed_compensation',
            format('Compensación fija mensual (%s)', to_char(v_month_cursor, 'YYYY-MM')),
            v_overlap_days,
            public.round_ars(v_rule.amount / v_days_in_month::NUMERIC),
            v_line_amount
          );
        END IF;

        v_month_cursor := (date_trunc('month', v_month_cursor) + INTERVAL '1 month')::DATE;
      END LOOP;

    ELSIF v_rule.frequency = 'weekly'
      AND v_rule.amount IS NOT NULL THEN
      v_weeks := CEIL((v_overlap_end - v_overlap_start + 1)::NUMERIC / 7.0);
      v_line_amount := public.round_ars(v_rule.amount * v_weeks);

      INSERT INTO public.professional_settlement_items (
        settlement_id,
        organization_id,
        rule_id,
        source_type,
        description,
        quantity,
        unit_amount,
        calculated_amount
      ) VALUES (
        v_settlement_id,
        v_org_id,
        v_rule.id,
        'fixed_compensation',
        format('Compensación semanal (%s semanas)', v_weeks),
        v_weeks,
        v_rule.amount,
        v_line_amount
      );

    ELSIF v_rule.frequency = 'biweekly'
      AND v_rule.amount IS NOT NULL THEN
      v_anchor := COALESCE(
        NULLIF(v_scheme.conditions->>'anchor_date', '')::DATE,
        NULLIF(v_rule.conditions->>'anchor_date', '')::DATE,
        v_scheme.valid_from
      );
      v_period_days := COALESCE(
        NULLIF(v_scheme.conditions->>'period_days', '')::INTEGER,
        NULLIF(v_rule.conditions->>'period_days', '')::INTEGER,
        14
      );

      v_biweekly_count := 0;
      v_window_start := v_anchor;

      WHILE v_window_start <= v_overlap_end LOOP
        v_window_end := v_window_start + (v_period_days - 1);

        IF v_window_end >= v_overlap_start AND v_window_start <= v_overlap_end THEN
          v_biweekly_count := v_biweekly_count + 1;
        END IF;

        v_window_start := v_window_start + v_period_days;
      END LOOP;

      IF v_biweekly_count > 0 THEN
        v_line_amount := public.round_ars(v_rule.amount * v_biweekly_count);

        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          v_settlement_id,
          v_org_id,
          v_rule.id,
          'fixed_compensation',
          format('Compensación quincenal (%s períodos)', v_biweekly_count),
          v_biweekly_count,
          v_rule.amount,
          v_line_amount
        );
      END IF;

    ELSIF v_rule.frequency = 'daily'
      AND v_rule.amount IS NOT NULL THEN
      v_days := v_overlap_end - v_overlap_start + 1;
      v_line_amount := public.round_ars(v_rule.amount * v_days);

      INSERT INTO public.professional_settlement_items (
        settlement_id,
        organization_id,
        rule_id,
        source_type,
        description,
        quantity,
        unit_amount,
        calculated_amount
      ) VALUES (
        v_settlement_id,
        v_org_id,
        v_rule.id,
        'fixed_compensation',
        format('Compensación diaria (%s días)', v_days),
        v_days,
        v_rule.amount,
        v_line_amount
      );

    ELSIF v_rule.frequency = 'per_consultation'
      AND v_prof.user_id IS NOT NULL THEN
      IF v_rule.rule_type = 'percentage' AND v_rule.percentage IS NOT NULL THEN
        FOR v_cons IN
          SELECT
            c.id,
            c.branch_id,
            COALESCE(inv.total, 0) AS invoice_total
          FROM public.consultations c
          LEFT JOIN LATERAL (
            SELECT i.total
            FROM public.invoices i
            WHERE i.consultation_id = c.id
              AND i.organization_id = v_org_id
              AND i.deleted_at IS NULL
              AND i.status <> 'anulada'
            ORDER BY i.created_at DESC
            LIMIT 1
          ) inv ON true
          WHERE c.organization_id = v_org_id
            AND c.deleted_at IS NULL
            AND c.status = 'completada'
            AND c.veterinarian_id = v_prof.user_id
            AND public.professional_activity_occurred_on(c.completed_at, c.updated_at, c.created_at)
              BETWEEN v_overlap_start AND v_overlap_end
            AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
            AND NOT EXISTS (
              SELECT 1
              FROM public.professional_settlement_source_claims cl
              WHERE cl.organization_id = v_org_id
                AND cl.source_type = 'consultation'
                AND cl.source_id = c.id
            )
        LOOP
          v_base := COALESCE(v_cons.invoice_total, 0);
          v_calc := public.round_ars(v_base * v_rule.percentage / 100.0);

          IF v_rule.minimum_amount IS NOT NULL THEN
            v_calc := GREATEST(v_calc, v_rule.minimum_amount);
          END IF;
          IF v_rule.maximum_amount IS NOT NULL THEN
            v_calc := LEAST(v_calc, v_rule.maximum_amount);
          END IF;

          IF v_calc > 0 THEN
            INSERT INTO public.professional_settlement_items (
              settlement_id,
              organization_id,
              rule_id,
              source_type,
              source_id,
              description,
              quantity,
              unit_amount,
              percentage,
              base_amount,
              calculated_amount
            ) VALUES (
              v_settlement_id,
              v_org_id,
              v_rule.id,
              'consultation',
              v_cons.id,
              'Porcentaje sobre consulta',
              1,
              NULL,
              v_rule.percentage,
              v_base,
              v_calc
            );
          END IF;
        END LOOP;
      ELSIF v_rule.amount IS NOT NULL THEN
        FOR v_cons IN
          SELECT c.id
          FROM public.consultations c
          WHERE c.organization_id = v_org_id
            AND c.deleted_at IS NULL
            AND c.status = 'completada'
            AND c.veterinarian_id = v_prof.user_id
            AND public.professional_activity_occurred_on(c.completed_at, c.updated_at, c.created_at)
              BETWEEN v_overlap_start AND v_overlap_end
            AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
            AND NOT EXISTS (
              SELECT 1
              FROM public.professional_settlement_source_claims cl
              WHERE cl.organization_id = v_org_id
                AND cl.source_type = 'consultation'
                AND cl.source_id = c.id
            )
        LOOP
          INSERT INTO public.professional_settlement_items (
            settlement_id,
            organization_id,
            rule_id,
            source_type,
            source_id,
            description,
            quantity,
            unit_amount,
            calculated_amount
          ) VALUES (
            v_settlement_id,
            v_org_id,
            v_rule.id,
            'consultation',
            v_cons.id,
            'Consulta completada',
            1,
            v_rule.amount,
            public.round_ars(v_rule.amount)
          );
        END LOOP;
      END IF;

    ELSIF v_rule.frequency = 'per_surgery'
      AND v_prof.user_id IS NOT NULL
      AND v_rule.amount IS NOT NULL THEN
      FOR v_cons IN
        SELECT s.id
        FROM public.surgeries s
        WHERE s.organization_id = v_org_id
          AND s.deleted_at IS NULL
          AND s.status = 'completada'
          AND s.surgeon_id = v_prof.user_id
          AND public.professional_activity_occurred_on(s.completed_at, s.updated_at, s.created_at)
            BETWEEN v_overlap_start AND v_overlap_end
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = v_org_id
              AND cl.source_type = 'surgery'
              AND cl.source_id = s.id
          )
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          v_settlement_id,
          v_org_id,
          v_rule.id,
          'surgery',
          v_cons.id,
          'Cirugía completada',
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;

    ELSIF v_rule.frequency = 'percentage'
      AND v_rule.rule_type = 'percentage'
      AND v_rule.percentage IS NOT NULL
      AND v_prof.user_id IS NOT NULL THEN
      FOR v_cons IN
        SELECT
          c.id,
          COALESCE(inv.total, 0) AS invoice_total
        FROM public.consultations c
        LEFT JOIN LATERAL (
          SELECT i.total
          FROM public.invoices i
          WHERE i.consultation_id = c.id
            AND i.organization_id = v_org_id
            AND i.deleted_at IS NULL
            AND i.status <> 'anulada'
          ORDER BY i.created_at DESC
          LIMIT 1
        ) inv ON true
        WHERE c.organization_id = v_org_id
          AND c.deleted_at IS NULL
          AND c.status = 'completada'
          AND c.veterinarian_id = v_prof.user_id
          AND public.professional_activity_occurred_on(c.completed_at, c.updated_at, c.created_at)
            BETWEEN v_overlap_start AND v_overlap_end
          AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = v_org_id
              AND cl.source_type = 'consultation'
              AND cl.source_id = c.id
          )
      LOOP
        v_base := COALESCE(v_cons.invoice_total, 0);
        v_calc := public.round_ars(v_base * v_rule.percentage / 100.0);

        IF v_rule.minimum_amount IS NOT NULL THEN
          v_calc := GREATEST(v_calc, v_rule.minimum_amount);
        END IF;
        IF v_rule.maximum_amount IS NOT NULL THEN
          v_calc := LEAST(v_calc, v_rule.maximum_amount);
        END IF;

        IF v_calc > 0 THEN
          INSERT INTO public.professional_settlement_items (
            settlement_id,
            organization_id,
            rule_id,
            source_type,
            source_id,
            description,
            quantity,
            percentage,
            base_amount,
            calculated_amount
          ) VALUES (
            v_settlement_id,
            v_org_id,
            v_rule.id,
            'consultation',
            v_cons.id,
            'Porcentaje sobre facturación de consulta',
            1,
            v_rule.percentage,
            v_base,
            v_calc
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public.recalculate_professional_settlement_totals(v_settlement_id);
  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_professional_settlement(UUID, DATE, DATE, UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: approve_professional_settlement
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_professional_settlement(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_item RECORD;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:approve') THEN
    RAISE EXCEPTION 'Sin permisos para aprobar liquidaciones';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidación';
  END IF;

  IF v_settlement.status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Solo se pueden aprobar liquidaciones en borrador o revisión';
  END IF;

  FOR v_item IN
    SELECT DISTINCT i.source_type, i.source_id
    FROM public.professional_settlement_items i
    WHERE i.settlement_id = v_settlement.id
      AND i.source_id IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO public.professional_settlement_source_claims (
        organization_id,
        source_type,
        source_id,
        settlement_id
      ) VALUES (
        v_org_id,
        v_item.source_type,
        v_item.source_id,
        v_settlement.id
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'La fuente %/% ya fue liquidada en otra liquidación',
          v_item.source_type, v_item.source_id;
    END;
  END LOOP;

  UPDATE public.professional_settlements s
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'approved_at', v_settlement.approved_at,
    'approved_by', v_settlement.approved_by,
    'total_amount', v_settlement.total_amount,
    'balance_due', v_settlement.balance_due
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_professional_settlement(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: cancel_professional_settlement
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_professional_settlement(
  p_settlement_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT (
      public.has_permission('professional_settlements:approve')
      OR public.has_permission('professional_compensation:write')
    ) THEN
    RAISE EXCEPTION 'Sin permisos para cancelar liquidaciones';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidación';
  END IF;

  IF v_settlement.status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar liquidaciones en borrador o revisión';
  END IF;

  DELETE FROM public.professional_settlement_source_claims c
  WHERE c.settlement_id = v_settlement.id;

  UPDATE public.professional_settlements s
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = NULLIF(btrim(p_reason), ''),
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'cancelled_at', v_settlement.cancelled_at,
    'cancellation_reason', v_settlement.cancellation_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_professional_settlement(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: add_professional_settlement_adjustment
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_professional_settlement_adjustment(
  p_settlement_id UUID,
  p_type public.settlement_adjustment_type,
  p_amount NUMERIC,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_adjustment public.professional_settlement_adjustments%ROWTYPE;
  v_amount NUMERIC(14, 2);
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para agregar ajustes';
  END IF;

  IF p_settlement_id IS NULL OR p_type IS NULL OR p_amount IS NULL OR p_reason IS NULL THEN
    RAISE EXCEPTION 'settlement_id, type, amount y reason son requeridos';
  END IF;

  v_amount := public.round_ars(p_amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;

  IF char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 3 caracteres';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidación';
  END IF;

  IF v_settlement.status <> 'draft' THEN
    RAISE EXCEPTION 'Solo se pueden agregar ajustes a liquidaciones en borrador';
  END IF;

  INSERT INTO public.professional_settlement_adjustments (
    settlement_id,
    organization_id,
    adjustment_type,
    amount,
    reason,
    created_by
  ) VALUES (
    v_settlement.id,
    v_org_id,
    p_type,
    v_amount,
    btrim(p_reason),
    auth.uid()
  )
  RETURNING * INTO v_adjustment;

  PERFORM public.recalculate_professional_settlement_totals(v_settlement.id);

  SELECT * INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_settlement.id;

  RETURN jsonb_build_object(
    'adjustment', to_jsonb(v_adjustment),
    'settlement', jsonb_build_object(
      'id', v_settlement.id,
      'gross_amount', v_settlement.gross_amount,
      'adjustments_amount', v_settlement.adjustments_amount,
      'deductions_amount', v_settlement.deductions_amount,
      'total_amount', v_settlement.total_amount,
      'balance_due', v_settlement.balance_due
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_professional_settlement_adjustment(UUID, public.settlement_adjustment_type, NUMERIC, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: register_professional_payment
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_professional_payment(
  p_settlement_id UUID,
  p_amount NUMERIC,
  p_method public.payment_method DEFAULT 'efectivo',
  p_paid_at TIMESTAMPTZ DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_invoice_date DATE DEFAULT NULL,
  p_invoice_amount NUMERIC DEFAULT NULL,
  p_invoice_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_payment public.professional_payments%ROWTYPE;
  v_amount NUMERIC(14, 2);
  v_total_paid NUMERIC(14, 2);
  v_new_status public.settlement_status;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:pay') THEN
    RAISE EXCEPTION 'Sin permisos para registrar pagos a profesionales';
  END IF;

  IF p_settlement_id IS NULL OR p_amount IS NULL THEN
    RAISE EXCEPTION 'settlement_id y amount son requeridos';
  END IF;

  v_amount := public.round_ars(p_amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidación';
  END IF;

  IF v_settlement.status NOT IN ('approved', 'partially_paid') THEN
    RAISE EXCEPTION 'Solo se pueden registrar pagos sobre liquidaciones aprobadas';
  END IF;

  IF v_settlement.balance_due <= 0 THEN
    RAISE EXCEPTION 'La liquidación ya está totalmente pagada';
  END IF;

  IF v_amount > v_settlement.balance_due THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente (%)', v_settlement.balance_due;
  END IF;

  INSERT INTO public.professional_payments (
    organization_id,
    professional_id,
    settlement_id,
    amount,
    currency,
    method,
    paid_at,
    reference,
    notes,
    invoice_number,
    invoice_date,
    invoice_amount,
    invoice_attachment_url,
    created_by
  ) VALUES (
    v_org_id,
    v_settlement.professional_id,
    v_settlement.id,
    v_amount,
    v_settlement.currency,
    COALESCE(p_method, 'efectivo'::public.payment_method),
    COALESCE(p_paid_at, now()),
    NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''),
    NULLIF(btrim(p_invoice_number), ''),
    p_invoice_date,
    CASE WHEN p_invoice_amount IS NULL THEN NULL ELSE public.round_ars(p_invoice_amount) END,
    NULLIF(btrim(p_invoice_attachment_url), ''),
    auth.uid()
  )
  RETURNING * INTO v_payment;

  v_total_paid := public.round_ars(v_settlement.total_paid + v_amount);
  v_new_status := CASE
    WHEN v_total_paid >= v_settlement.total_amount THEN 'paid'::public.settlement_status
    ELSE 'partially_paid'::public.settlement_status
  END;

  UPDATE public.professional_settlements s
  SET
    total_paid = v_total_paid,
    balance_due = public.round_ars(s.total_amount - v_total_paid),
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN COALESCE(s.paid_at, now()) ELSE s.paid_at END,
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'settlement', jsonb_build_object(
      'id', v_settlement.id,
      'status', v_settlement.status,
      'total_paid', v_settlement.total_paid,
      'balance_due', v_settlement.balance_due,
      'paid_at', v_settlement.paid_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_professional_payment(
  UUID,
  NUMERIC,
  public.payment_method,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  NUMERIC,
  TEXT
) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: get_professional_settlement
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_professional_settlement(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:read') THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'settlement', to_jsonb(v_settlement),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
      FROM public.professional_settlement_items i
      WHERE i.settlement_id = v_settlement.id
    ), '[]'::jsonb),
    'adjustments', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.professional_settlement_adjustments a
      WHERE a.settlement_id = v_settlement.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at)
      FROM public.professional_payments p
      WHERE p.settlement_id = v_settlement.id
        AND p.deleted_at IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_professional_settlement(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: list_professional_settlements
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_professional_settlements(
  p_professional_id UUID DEFAULT NULL,
  p_status public.settlement_status DEFAULT NULL,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_offset INTEGER;
  v_total BIGINT;
  v_rows JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:read') THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', v_page, 'page_size', v_page_size);
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', v_page, 'page_size', v_page_size);
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  SELECT COUNT(*)
  INTO v_total
  FROM public.professional_settlements s
  WHERE s.organization_id = v_org_id
    AND s.deleted_at IS NULL
    AND (p_professional_id IS NULL OR s.professional_id = p_professional_id)
    AND (p_status IS NULL OR s.status = p_status)
    AND (p_period_start IS NULL OR s.period_end >= p_period_start)
    AND (p_period_end IS NULL OR s.period_start <= p_period_end)
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    AND (
      s.branch_id IS NULL
      OR public.user_has_branch_access(s.branch_id)
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.period_end DESC, x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT s.*
    FROM public.professional_settlements s
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL
      AND (p_professional_id IS NULL OR s.professional_id = p_professional_id)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_period_start IS NULL OR s.period_end >= p_period_start)
      AND (p_period_end IS NULL OR s.period_start <= p_period_end)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND (
        s.branch_id IS NULL
        OR public.user_has_branch_access(s.branch_id)
      )
    ORDER BY s.period_end DESC, s.created_at DESC
    LIMIT v_page_size
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object(
    'items', v_rows,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_professional_settlements(
  UUID,
  public.settlement_status,
  DATE,
  DATE,
  UUID,
  INTEGER,
  INTEGER
) TO authenticated;
