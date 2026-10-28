-- Compras: proveedores, prestadores, moneda y margen de venta

CREATE TYPE public.purchase_party_kind AS ENUM (
  'proveedor',
  'prestador'
);

CREATE TYPE public.purchase_party_scope AS ENUM (
  'general',
  'vacunas'
);

CREATE TYPE public.product_currency AS ENUM (
  'ARS',
  'USD'
);

CREATE TABLE public.purchase_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  kind public.purchase_party_kind NOT NULL,
  scope public.purchase_party_scope NOT NULL DEFAULT 'general',
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT purchase_parties_contact_len CHECK (
    contact_name IS NULL OR char_length(contact_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT purchase_parties_phone_len CHECK (
    phone IS NULL OR char_length(phone) BETWEEN 1 AND 40
  ),
  CONSTRAINT purchase_parties_email_len CHECK (
    email IS NULL OR char_length(email) BETWEEN 3 AND 160
  ),
  CONSTRAINT purchase_parties_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  )
);

CREATE UNIQUE INDEX uq_purchase_parties_name
  ON public.purchase_parties (organization_id, kind, scope, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX idx_purchase_parties_org_kind
  ON public.purchase_parties (organization_id, kind, scope, name)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_purchase_parties_updated_at
  BEFORE UPDATE ON public.purchase_parties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_purchase_parties
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_parties
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.purchase_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_parties_select_tenant" ON public.purchase_parties
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('inventory:read')
  );

CREATE POLICY "purchase_parties_insert_tenant" ON public.purchase_parties
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('inventory:write')
  );

CREATE POLICY "purchase_parties_update_tenant" ON public.purchase_parties
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('inventory:write')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.purchase_parties TO authenticated;

ALTER TABLE public.inventory_products
  ADD COLUMN cost_currency public.product_currency NOT NULL DEFAULT 'ARS',
  ADD COLUMN margin_percent NUMERIC(6, 2),
  ADD COLUMN supplier_party_id UUID REFERENCES public.purchase_parties(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_margin_range
  CHECK (
    margin_percent IS NULL
    OR (margin_percent >= 0 AND margin_percent <= 1000)
  );

CREATE INDEX idx_inventory_products_supplier
  ON public.inventory_products (supplier_party_id)
  WHERE deleted_at IS NULL AND supplier_party_id IS NOT NULL;
