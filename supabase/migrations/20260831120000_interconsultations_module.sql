-- Interconsultas module — STAGING ONLY. Additive migration.
-- Isolated from clinical consultas. Does not weaken existing RLS.

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interconsultation_status') THEN
    CREATE TYPE public.interconsultation_status AS ENUM (
      'draft',
      'requesting',
      'quotes_received',
      'approved',
      'in_progress',
      'completed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interconsultation_priority') THEN
    CREATE TYPE public.interconsultation_priority AS ENUM (
      'normal',
      'urgent'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interconsultation_request_status') THEN
    CREATE TYPE public.interconsultation_request_status AS ENUM (
      'pending',
      'sent',
      'viewed',
      'quoted',
      'accepted',
      'declined',
      'expired',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interconsultation_quote_status') THEN
    CREATE TYPE public.interconsultation_quote_status AS ENUM (
      'pending',
      'submitted',
      'accepted',
      'rejected',
      'withdrawn'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interconsultation_billing_link_status') THEN
    CREATE TYPE public.interconsultation_billing_link_status AS ENUM (
      'pending',
      'invoiced',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interconsultation_settlement_link_status') THEN
    CREATE TYPE public.interconsultation_settlement_link_status AS ENUM (
      'pending',
      'linked',
      'cancelled'
    );
  END IF;
END $$;

ALTER TYPE public.settlement_item_source_type ADD VALUE IF NOT EXISTS 'interconsultation';

-- ─────────────────────────────────────────────
-- Permissions (extend has_permission role arrays)
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
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay',
      'interconsultations:read','interconsultations:write','interconsultations:approve','interconsultations:billing'
    ]
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay',
      'interconsultations:read','interconsultations:write','interconsultations:approve','interconsultations:billing'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export','waiting_room:read','waiting_room:write',
      'interconsultations:read','interconsultations:write'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'interconsultations:read'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send','waiting_room:read','waiting_room:write',
      'interconsultations:read'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'professional_settlements:read','professional_settlements:pay',
      'interconsultations:read','interconsultations:billing'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read','waiting_room:read',
      'interconsultations:read'
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
  'professionals.interconsultations',
  'Interconsultas',
  'Solicitudes de opinión o servicio a profesionales internos/externos',
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

-- Enable on all active plans for Staging QA (same pattern as professionals.settlements).
INSERT INTO public.plan_features (plan_id, feature_id, enabled, limit_value)
SELECT p.id, f.id, true, NULL
FROM public.plans p
CROSS JOIN public.features f
WHERE p.is_active
  AND f.key = 'professionals.interconsultations'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();

-- ─────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interconsultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  owner_id UUID NOT NULL REFERENCES public.owners(id),
  requested_by UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  clinical_question TEXT NOT NULL,
  clinical_summary TEXT,
  priority public.interconsultation_priority NOT NULL DEFAULT 'normal',
  status public.interconsultation_status NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'ARS',
  clinic_markup_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0,
  clinic_markup_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  professional_base_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  client_final_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  accepted_response_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT interconsultations_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT interconsultations_question_len CHECK (char_length(clinical_question) BETWEEN 1 AND 8000),
  CONSTRAINT interconsultations_summary_len CHECK (clinical_summary IS NULL OR char_length(clinical_summary) <= 8000),
  CONSTRAINT interconsultations_currency_len CHECK (char_length(currency) = 3),
  CONSTRAINT interconsultations_amounts_nonneg CHECK (
    clinic_markup_percentage >= 0
    AND clinic_markup_amount >= 0
    AND professional_base_amount >= 0
    AND client_final_amount >= 0
  )
);

CREATE TABLE IF NOT EXISTS public.interconsultation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  interconsultation_id UUID NOT NULL REFERENCES public.interconsultations(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id),
  external_professional_name TEXT,
  external_professional_email TEXT,
  external_professional_phone TEXT,
  secure_token_hash TEXT,
  token_expires_at TIMESTAMPTZ,
  status public.interconsultation_request_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT interconsultation_requests_target_chk CHECK (
    professional_id IS NOT NULL
    OR (
      external_professional_name IS NOT NULL
      AND char_length(trim(external_professional_name)) > 0
    )
  )
);

CREATE TABLE IF NOT EXISTS public.interconsultation_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  interconsultation_request_id UUID NOT NULL REFERENCES public.interconsultation_requests(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id),
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  estimated_delivery TEXT,
  professional_message TEXT,
  status public.interconsultation_quote_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT interconsultation_quotes_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT interconsultation_quotes_currency_len CHECK (char_length(currency) = 3),
  CONSTRAINT interconsultation_quotes_delivery_len CHECK (
    estimated_delivery IS NULL OR char_length(estimated_delivery) <= 200
  ),
  CONSTRAINT interconsultation_quotes_message_len CHECK (
    professional_message IS NULL OR char_length(professional_message) <= 4000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interconsultation_quotes_one_active
  ON public.interconsultation_quotes (interconsultation_request_id)
  WHERE deleted_at IS NULL AND status IN ('pending', 'submitted', 'accepted');

CREATE TABLE IF NOT EXISTS public.interconsultation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  interconsultation_id UUID NOT NULL REFERENCES public.interconsultations(id) ON DELETE CASCADE,
  interconsultation_request_id UUID NOT NULL REFERENCES public.interconsultation_requests(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id),
  response_text TEXT NOT NULL,
  recommendations TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT interconsultation_responses_text_len CHECK (char_length(response_text) BETWEEN 1 AND 16000),
  CONSTRAINT interconsultation_responses_rec_len CHECK (
    recommendations IS NULL OR char_length(recommendations) <= 8000
  )
);

ALTER TABLE public.interconsultations
  DROP CONSTRAINT IF EXISTS interconsultations_accepted_response_fk;
ALTER TABLE public.interconsultations
  ADD CONSTRAINT interconsultations_accepted_response_fk
  FOREIGN KEY (accepted_response_id) REFERENCES public.interconsultation_responses(id);

CREATE TABLE IF NOT EXISTS public.interconsultation_billing_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  interconsultation_id UUID NOT NULL REFERENCES public.interconsultations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id),
  status public.interconsultation_billing_link_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interconsultation_billing_one_active
  ON public.interconsultation_billing_links (interconsultation_id)
  WHERE deleted_at IS NULL AND status IN ('pending', 'invoiced');

CREATE TABLE IF NOT EXISTS public.interconsultation_settlement_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  interconsultation_id UUID NOT NULL REFERENCES public.interconsultations(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  professional_settlement_id UUID REFERENCES public.professional_settlements(id),
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.interconsultation_settlement_link_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT interconsultation_settlement_amount_nonneg CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interconsultation_settlement_one_active
  ON public.interconsultation_settlement_links (interconsultation_id, professional_id)
  WHERE deleted_at IS NULL AND status IN ('pending', 'linked');

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interconsultations_org_status_created
  ON public.interconsultations (organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultations_org_patient
  ON public.interconsultations (organization_id, patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultations_org_priority
  ON public.interconsultations (organization_id, priority, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultation_requests_ic_status
  ON public.interconsultation_requests (interconsultation_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultation_requests_pro_status
  ON public.interconsultation_requests (professional_id, status)
  WHERE deleted_at IS NULL AND professional_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultation_requests_token_hash
  ON public.interconsultation_requests (secure_token_hash)
  WHERE secure_token_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultation_quotes_request_status
  ON public.interconsultation_quotes (interconsultation_request_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultation_billing_org_status
  ON public.interconsultation_billing_links (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interconsultation_settlement_org_status
  ON public.interconsultation_settlement_links (organization_id, status)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_interconsultations_updated_at ON public.interconsultations;
CREATE TRIGGER trg_interconsultations_updated_at
  BEFORE UPDATE ON public.interconsultations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interconsultation_requests_updated_at ON public.interconsultation_requests;
CREATE TRIGGER trg_interconsultation_requests_updated_at
  BEFORE UPDATE ON public.interconsultation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interconsultation_quotes_updated_at ON public.interconsultation_quotes;
CREATE TRIGGER trg_interconsultation_quotes_updated_at
  BEFORE UPDATE ON public.interconsultation_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interconsultation_responses_updated_at ON public.interconsultation_responses;
CREATE TRIGGER trg_interconsultation_responses_updated_at
  BEFORE UPDATE ON public.interconsultation_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interconsultation_billing_links_updated_at ON public.interconsultation_billing_links;
CREATE TRIGGER trg_interconsultation_billing_links_updated_at
  BEFORE UPDATE ON public.interconsultation_billing_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interconsultation_settlement_links_updated_at ON public.interconsultation_settlement_links;
CREATE TRIGGER trg_interconsultation_settlement_links_updated_at
  BEFORE UPDATE ON public.interconsultation_settlement_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- Audit triggers
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_interconsultations ON public.interconsultations;
CREATE TRIGGER trg_audit_interconsultations
  AFTER INSERT OR UPDATE OR DELETE ON public.interconsultations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_interconsultation_requests ON public.interconsultation_requests;
CREATE TRIGGER trg_audit_interconsultation_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.interconsultation_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_interconsultation_quotes ON public.interconsultation_quotes;
CREATE TRIGGER trg_audit_interconsultation_quotes
  AFTER INSERT OR UPDATE OR DELETE ON public.interconsultation_quotes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_interconsultation_responses ON public.interconsultation_responses;
CREATE TRIGGER trg_audit_interconsultation_responses
  AFTER INSERT OR UPDATE OR DELETE ON public.interconsultation_responses
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_interconsultation_billing_links ON public.interconsultation_billing_links;
CREATE TRIGGER trg_audit_interconsultation_billing_links
  AFTER INSERT OR UPDATE OR DELETE ON public.interconsultation_billing_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_interconsultation_settlement_links ON public.interconsultation_settlement_links;
CREATE TRIGGER trg_audit_interconsultation_settlement_links
  AFTER INSERT OR UPDATE OR DELETE ON public.interconsultation_settlement_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.interconsultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_billing_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_billing_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_settlement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interconsultation_settlement_links FORCE ROW LEVEL SECURITY;

-- interconsultations
DROP POLICY IF EXISTS interconsultations_select ON public.interconsultations;
CREATE POLICY interconsultations_select ON public.interconsultations
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:read')
    AND deleted_at IS NULL
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  );

DROP POLICY IF EXISTS interconsultations_insert ON public.interconsultations;
CREATE POLICY interconsultations_insert ON public.interconsultations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  );

DROP POLICY IF EXISTS interconsultations_update ON public.interconsultations;
CREATE POLICY interconsultations_update ON public.interconsultations
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
  );

-- requests
DROP POLICY IF EXISTS interconsultation_requests_select ON public.interconsultation_requests;
CREATE POLICY interconsultation_requests_select ON public.interconsultation_requests
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:read')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS interconsultation_requests_insert ON public.interconsultation_requests;
CREATE POLICY interconsultation_requests_insert ON public.interconsultation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
  );

DROP POLICY IF EXISTS interconsultation_requests_update ON public.interconsultation_requests;
CREATE POLICY interconsultation_requests_update ON public.interconsultation_requests
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
    AND deleted_at IS NULL
  )
  WITH CHECK (organization_id = public.get_user_organization_id());

-- quotes
DROP POLICY IF EXISTS interconsultation_quotes_select ON public.interconsultation_quotes;
CREATE POLICY interconsultation_quotes_select ON public.interconsultation_quotes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:read')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS interconsultation_quotes_insert ON public.interconsultation_quotes;
CREATE POLICY interconsultation_quotes_insert ON public.interconsultation_quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
  );

DROP POLICY IF EXISTS interconsultation_quotes_update ON public.interconsultation_quotes;
CREATE POLICY interconsultation_quotes_update ON public.interconsultation_quotes
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_permission('interconsultations:write')
      OR public.has_permission('interconsultations:approve')
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (organization_id = public.get_user_organization_id());

-- responses
DROP POLICY IF EXISTS interconsultation_responses_select ON public.interconsultation_responses;
CREATE POLICY interconsultation_responses_select ON public.interconsultation_responses
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:read')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS interconsultation_responses_insert ON public.interconsultation_responses;
CREATE POLICY interconsultation_responses_insert ON public.interconsultation_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
  );

DROP POLICY IF EXISTS interconsultation_responses_update ON public.interconsultation_responses;
CREATE POLICY interconsultation_responses_update ON public.interconsultation_responses
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
    AND deleted_at IS NULL
  )
  WITH CHECK (organization_id = public.get_user_organization_id());

-- billing links
DROP POLICY IF EXISTS interconsultation_billing_links_select ON public.interconsultation_billing_links;
CREATE POLICY interconsultation_billing_links_select ON public.interconsultation_billing_links
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_permission('interconsultations:read')
      OR public.has_permission('interconsultations:billing')
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS interconsultation_billing_links_insert ON public.interconsultation_billing_links;
CREATE POLICY interconsultation_billing_links_insert ON public.interconsultation_billing_links
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_permission('interconsultations:write')
      OR public.has_permission('interconsultations:billing')
    )
  );

DROP POLICY IF EXISTS interconsultation_billing_links_update ON public.interconsultation_billing_links;
CREATE POLICY interconsultation_billing_links_update ON public.interconsultation_billing_links
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:billing')
    AND deleted_at IS NULL
  )
  WITH CHECK (organization_id = public.get_user_organization_id());

-- settlement links
DROP POLICY IF EXISTS interconsultation_settlement_links_select ON public.interconsultation_settlement_links;
CREATE POLICY interconsultation_settlement_links_select ON public.interconsultation_settlement_links
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_permission('interconsultations:read')
      OR public.has_permission('professional_settlements:read')
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS interconsultation_settlement_links_insert ON public.interconsultation_settlement_links;
CREATE POLICY interconsultation_settlement_links_insert ON public.interconsultation_settlement_links
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('interconsultations:write')
  );

DROP POLICY IF EXISTS interconsultation_settlement_links_update ON public.interconsultation_settlement_links;
CREATE POLICY interconsultation_settlement_links_update ON public.interconsultation_settlement_links
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_permission('interconsultations:write')
      OR public.has_permission('professional_settlements:approve')
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (organization_id = public.get_user_organization_id());

-- ─────────────────────────────────────────────
-- External token helpers (hash-only storage)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hash_interconsultation_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.get_interconsultation_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_req public.interconsultation_requests%ROWTYPE;
  v_ic public.interconsultations%ROWTYPE;
  v_patient RECORD;
  v_clinic_name TEXT;
  v_quote public.interconsultation_quotes%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enlace inválido');
  END IF;

  v_hash := public.hash_interconsultation_token(trim(p_token));

  SELECT * INTO v_req
  FROM public.interconsultation_requests
  WHERE secure_token_hash = v_hash
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enlace inválido o expirado');
  END IF;

  IF v_req.token_expires_at IS NOT NULL AND v_req.token_expires_at < timezone('utc', now()) THEN
    UPDATE public.interconsultation_requests
    SET status = 'expired', updated_at = timezone('utc', now())
    WHERE id = v_req.id AND status NOT IN ('accepted', 'declined', 'cancelled', 'expired');
    RETURN jsonb_build_object('ok', false, 'error', 'Este enlace expiró');
  END IF;

  IF v_req.status IN ('cancelled', 'expired', 'declined') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta solicitud ya no está disponible');
  END IF;

  SELECT * INTO v_ic
  FROM public.interconsultations
  WHERE id = v_req.interconsultation_id
    AND deleted_at IS NULL;

  IF NOT FOUND OR v_ic.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La interconsulta ya no está disponible');
  END IF;

  SELECT o.name
  INTO v_clinic_name
  FROM public.organizations o
  WHERE o.id = v_ic.organization_id;

  SELECT
    p.name AS patient_name,
    p.species::text AS species,
    p.breed,
    p.birth_date,
    p.sex::text AS sex
  INTO v_patient
  FROM public.patients p
  WHERE p.id = v_ic.patient_id
    AND p.organization_id = v_ic.organization_id
    AND p.deleted_at IS NULL;

  IF v_req.viewed_at IS NULL THEN
    UPDATE public.interconsultation_requests
    SET
      viewed_at = timezone('utc', now()),
      status = CASE WHEN status IN ('pending', 'sent') THEN 'viewed'::public.interconsultation_request_status ELSE status END,
      updated_at = timezone('utc', now())
    WHERE id = v_req.id;
  END IF;

  SELECT * INTO v_quote
  FROM public.interconsultation_quotes
  WHERE interconsultation_request_id = v_req.id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', v_req.id,
      'status', v_req.status,
      'professionalName', coalesce(
        v_req.external_professional_name,
        (
          SELECT trim(pr.first_name || ' ' || pr.last_name)
          FROM public.professionals pr
          WHERE pr.id = v_req.professional_id
        )
      )
    ),
    'interconsultation', jsonb_build_object(
      'id', v_ic.id,
      'title', v_ic.title,
      'clinicalQuestion', v_ic.clinical_question,
      'clinicalSummary', v_ic.clinical_summary,
      'priority', v_ic.priority,
      'status', v_ic.status,
      'currency', v_ic.currency
    ),
    'clinic', jsonb_build_object('name', coalesce(v_clinic_name, 'Clínica')),
    'patient', jsonb_build_object(
      'name', v_patient.patient_name,
      'species', v_patient.species,
      'breed', v_patient.breed,
      'birthDate', v_patient.birth_date,
      'sex', v_patient.sex
    ),
    'quote', CASE WHEN v_quote.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_quote.id,
      'amount', v_quote.amount,
      'currency', v_quote.currency,
      'estimatedDelivery', v_quote.estimated_delivery,
      'professionalMessage', v_quote.professional_message,
      'status', v_quote.status
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_interconsultation_quote_by_token(
  p_token TEXT,
  p_amount NUMERIC,
  p_estimated_delivery TEXT DEFAULT NULL,
  p_professional_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_req public.interconsultation_requests%ROWTYPE;
  v_ic public.interconsultations%ROWTYPE;
  v_quote_id UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enlace inválido');
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido');
  END IF;

  v_hash := public.hash_interconsultation_token(trim(p_token));

  SELECT * INTO v_req
  FROM public.interconsultation_requests
  WHERE secure_token_hash = v_hash
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enlace inválido o expirado');
  END IF;

  IF v_req.token_expires_at IS NOT NULL AND v_req.token_expires_at < timezone('utc', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este enlace expiró');
  END IF;

  IF v_req.status IN ('accepted', 'declined', 'cancelled', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta solicitud ya no admite presupuestos');
  END IF;

  SELECT * INTO v_ic
  FROM public.interconsultations
  WHERE id = v_req.interconsultation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_ic.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La interconsulta ya no admite presupuestos');
  END IF;

  UPDATE public.interconsultation_quotes
  SET status = 'withdrawn', updated_at = timezone('utc', now())
  WHERE interconsultation_request_id = v_req.id
    AND deleted_at IS NULL
    AND status IN ('pending', 'submitted');

  INSERT INTO public.interconsultation_quotes (
    organization_id,
    interconsultation_request_id,
    professional_id,
    amount,
    currency,
    estimated_delivery,
    professional_message,
    status
  ) VALUES (
    v_req.organization_id,
    v_req.id,
    v_req.professional_id,
    round(p_amount::numeric, 2),
    v_ic.currency,
    NULLIF(trim(p_estimated_delivery), ''),
    NULLIF(trim(p_professional_message), ''),
    'submitted'
  )
  RETURNING id INTO v_quote_id;

  UPDATE public.interconsultation_requests
  SET
    status = 'quoted',
    responded_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = v_req.id;

  IF v_ic.status IN ('draft', 'requesting') THEN
    UPDATE public.interconsultations
    SET status = 'quotes_received', updated_at = timezone('utc', now())
    WHERE id = v_ic.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quoteId', v_quote_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_interconsultation_response_by_token(
  p_token TEXT,
  p_response_text TEXT,
  p_recommendations TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_req public.interconsultation_requests%ROWTYPE;
  v_ic public.interconsultations%ROWTYPE;
  v_response_id UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enlace inválido');
  END IF;
  IF p_response_text IS NULL OR length(trim(p_response_text)) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La respuesta es obligatoria');
  END IF;

  v_hash := public.hash_interconsultation_token(trim(p_token));

  SELECT * INTO v_req
  FROM public.interconsultation_requests
  WHERE secure_token_hash = v_hash
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enlace inválido o expirado');
  END IF;

  IF v_req.status <> 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el profesional aceptado puede responder');
  END IF;

  SELECT * INTO v_ic
  FROM public.interconsultations
  WHERE id = v_req.interconsultation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_ic.status NOT IN ('approved', 'in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La interconsulta no admite respuesta en este estado');
  END IF;

  INSERT INTO public.interconsultation_responses (
    organization_id,
    interconsultation_id,
    interconsultation_request_id,
    professional_id,
    response_text,
    recommendations,
    completed_at
  ) VALUES (
    v_req.organization_id,
    v_ic.id,
    v_req.id,
    v_req.professional_id,
    trim(p_response_text),
    NULLIF(trim(p_recommendations), ''),
    timezone('utc', now())
  )
  RETURNING id INTO v_response_id;

  UPDATE public.interconsultations
  SET
    status = 'in_progress',
    accepted_response_id = v_response_id,
    updated_at = timezone('utc', now())
  WHERE id = v_ic.id;

  RETURN jsonb_build_object('ok', true, 'responseId', v_response_id);
END;
$$;

REVOKE ALL ON FUNCTION public.hash_interconsultation_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_interconsultation_by_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_interconsultation_quote_by_token(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_interconsultation_response_by_token(TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hash_interconsultation_token(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_interconsultation_by_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_interconsultation_quote_by_token(TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_interconsultation_response_by_token(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

COMMENT ON TABLE public.interconsultations IS
  'Independent interconsultation requests (not clinical consultas). STAGING module.';
COMMENT ON COLUMN public.interconsultation_requests.secure_token_hash IS
  'SHA-256 hex of external access token. Raw token never stored.';
