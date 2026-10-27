BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.purchase_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  base_category public.inventory_product_category NOT NULL DEFAULT 'otro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX purchase_categories_name ON public.purchase_categories (organization_id, lower(btrim(name))) WHERE deleted_at IS NULL;
CREATE TABLE public.purchase_pricing_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  usd_ars numeric(14,4) NOT NULL CHECK (usd_ars > 0 AND usd_ars < 1000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_pricing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_categories, public.purchase_pricing_settings, public.purchase_parties FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_categories, public.purchase_pricing_settings, public.purchase_parties TO authenticated;

CREATE POLICY purchase_categories_read ON public.purchase_categories FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:read'));
CREATE POLICY purchase_categories_insert ON public.purchase_categories FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:write'));
CREATE POLICY purchase_categories_update ON public.purchase_categories FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL AND public.has_permission('inventory:write'))
  WITH CHECK (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:write'));
CREATE POLICY purchase_pricing_read ON public.purchase_pricing_settings FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:read'));
CREATE POLICY purchase_pricing_insert ON public.purchase_pricing_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:write'));
CREATE POLICY purchase_pricing_update ON public.purchase_pricing_settings FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:write'))
  WITH CHECK (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:write'));

DROP POLICY purchase_parties_select_tenant ON public.purchase_parties;
CREATE POLICY purchase_parties_select_tenant ON public.purchase_parties FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:read'));
DROP POLICY purchase_parties_update_tenant ON public.purchase_parties;
CREATE POLICY purchase_parties_update_tenant ON public.purchase_parties FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL AND public.has_permission('inventory:write'))
  WITH CHECK (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:write'));
DROP POLICY inventory_products_select_tenant ON public.inventory_products;
CREATE POLICY inventory_products_select_tenant ON public.inventory_products FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id() AND public.has_permission('inventory:read'));

ALTER TABLE public.inventory_products ADD COLUMN catalog_category_id uuid;
ALTER TABLE public.inventory_products ADD CONSTRAINT inventory_products_catalog_category_tenant
  FOREIGN KEY (catalog_category_id, organization_id) REFERENCES public.purchase_categories(id, organization_id) NOT VALID;
ALTER TABLE public.inventory_products VALIDATE CONSTRAINT inventory_products_catalog_category_tenant;
CREATE INDEX inventory_products_catalog_category ON public.inventory_products(catalog_category_id) WHERE catalog_category_id IS NOT NULL;

CREATE FUNCTION public.validate_purchase_catalog_product() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_supplier public.purchase_parties%ROWTYPE;
  v_category public.purchase_categories%ROWTYPE;
  v_rate numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.organization_id <> OLD.organization_id OR NEW.branch_id <> OLD.branch_id) THEN
    RAISE EXCEPTION 'No se puede trasladar un producto a otra veterinaria o sucursal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = NEW.branch_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Sucursal inválida para esta veterinaria';
  END IF;
  IF NEW.catalog_category_id IS NOT NULL THEN
    SELECT * INTO v_category FROM public.purchase_categories WHERE id = NEW.catalog_category_id AND organization_id = NEW.organization_id AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND OR v_category.base_category <> NEW.category THEN
      RAISE EXCEPTION 'La categoría no está disponible o no corresponde al tipo de producto';
    END IF;
  END IF;
  IF NEW.supplier_party_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.purchase_parties WHERE id = NEW.supplier_party_id AND organization_id = NEW.organization_id AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND OR v_supplier.kind <> 'proveedor' OR
       v_supplier.scope::text <> (CASE WHEN NEW.category = 'vacuna' THEN 'vacunas' ELSE 'general' END) THEN
      RAISE EXCEPTION 'El proveedor no corresponde al producto o a esta veterinaria';
    END IF;
    IF NOT v_supplier.is_active AND (TG_OP = 'INSERT' OR NEW.supplier_party_id IS DISTINCT FROM OLD.supplier_party_id) THEN
      RAISE EXCEPTION 'El proveedor está inactivo';
    END IF;
  END IF;
  IF NEW.margin_percent IS NOT NULL AND NEW.unit_cost IS NULL THEN
    RAISE EXCEPTION 'Para calcular la ganancia indicá el costo';
  END IF;
  IF NEW.cost_currency = 'USD' AND NEW.unit_cost IS NOT NULL THEN
    SELECT usd_ars INTO v_rate FROM public.purchase_pricing_settings WHERE organization_id = NEW.organization_id FOR SHARE;
    IF v_rate IS NULL THEN RAISE EXCEPTION 'Configurá la cotización USD/ARS en Compras'; END IF;
  ELSE
    v_rate := 1;
  END IF;
  IF NEW.margin_percent IS NOT NULL THEN
    NEW.unit_price := round(NEW.unit_cost * v_rate * (1 + NEW.margin_percent / 100), 2);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_purchase_catalog_product() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_purchase_catalog_product BEFORE INSERT OR UPDATE ON public.inventory_products FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_catalog_product();

CREATE FUNCTION public.guard_purchase_catalog_reference() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'No se puede cambiar la veterinaria'; END IF;
  IF TG_TABLE_NAME = 'purchase_categories' THEN
    IF (NEW.deleted_at IS NOT NULL OR NEW.base_category <> OLD.base_category) AND EXISTS (
      SELECT 1 FROM public.inventory_products WHERE catalog_category_id = OLD.id AND deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'La categoría tiene productos vinculados'; END IF;
  ELSE
    IF (NEW.deleted_at IS NOT NULL OR NEW.kind <> OLD.kind OR NEW.scope <> OLD.scope) AND EXISTS (
      SELECT 1 FROM public.inventory_products WHERE supplier_party_id = OLD.id AND deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'El proveedor tiene productos vinculados'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_purchase_catalog_reference() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_purchase_category BEFORE UPDATE ON public.purchase_categories FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_catalog_reference();
CREATE TRIGGER guard_purchase_party BEFORE UPDATE ON public.purchase_parties FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_catalog_reference();
CREATE TRIGGER purchase_categories_updated_at BEFORE UPDATE ON public.purchase_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER purchase_categories_audit AFTER INSERT OR UPDATE OR DELETE ON public.purchase_categories FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
CREATE TRIGGER purchase_pricing_updated_at BEFORE UPDATE ON public.purchase_pricing_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER purchase_pricing_audit AFTER INSERT OR UPDATE OR DELETE ON public.purchase_pricing_settings FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE FUNCTION public.reprice_purchase_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.inventory_products SET unit_price = round(unit_cost * NEW.usd_ars * (1 + margin_percent / 100), 2)
  WHERE organization_id = NEW.organization_id AND cost_currency = 'USD' AND margin_percent IS NOT NULL AND unit_cost IS NOT NULL AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reprice_purchase_catalog() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reprice_purchase_catalog AFTER INSERT OR UPDATE OF usd_ars ON public.purchase_pricing_settings FOR EACH ROW EXECUTE FUNCTION public.reprice_purchase_catalog();
CREATE OR REPLACE FUNCTION public.receive_inventory_purchase(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_branch_id UUID;
  v_supplier TEXT;
  v_invoice TEXT;
  v_purchased_at DATE;
  v_notes TEXT;
  v_items JSONB;
  v_item JSONB;
  v_purchase_id UUID;
  v_product public.inventory_products%ROWTYPE;
  v_qty NUMERIC(14, 3);
  v_unit_cost NUMERIC(14, 2);
  v_rate numeric;
  v_line_total NUMERIC(14, 2);
  v_before NUMERIC(14, 3);
  v_after NUMERIC(14, 3);
  v_movement_id UUID;
  v_total NUMERIC(14, 2) := 0;
  v_item_count INT := 0;
  v_lot TEXT;
  v_expires DATE;
  v_reason TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('inventory:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Datos de compra inválidos';
  END IF;

  v_branch_id := NULLIF(p_payload->>'branch_id', '')::UUID;
  v_supplier := NULLIF(btrim(COALESCE(p_payload->>'supplier_name', '')), '');
  v_invoice := NULLIF(btrim(COALESCE(p_payload->>'invoice_number', '')), '');
  v_notes := NULLIF(btrim(COALESCE(p_payload->>'notes', '')), '');
  v_items := COALESCE(p_payload->'items', '[]'::jsonb);

  BEGIN
    v_purchased_at := COALESCE(NULLIF(p_payload->>'purchased_at', '')::DATE, CURRENT_DATE);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Fecha de compra inválida';
  END;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Seleccioná una sucursal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = v_branch_id
      AND b.organization_id = v_org_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Sucursal inválida';
  END IF;

  IF v_supplier IS NULL OR char_length(v_supplier) > 160 THEN
    RAISE EXCEPTION 'Indicá el proveedor';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un producto';
  END IF;

  IF jsonb_array_length(v_items) > 100 THEN
    RAISE EXCEPTION 'Máximo 100 ítems por compra';
  END IF;

  INSERT INTO public.inventory_purchases (
    organization_id,
    branch_id,
    supplier_name,
    invoice_number,
    purchased_at,
    notes,
    status,
    total_cost,
    received_by
  )
  VALUES (
    v_org_id,
    v_branch_id,
    v_supplier,
    v_invoice,
    v_purchased_at,
    v_notes,
    'recibida',
    0,
    auth.uid()
  )
  RETURNING id INTO v_purchase_id;

  v_reason := 'Compra'
    || CASE WHEN v_invoice IS NOT NULL THEN ' ' || v_invoice ELSE '' END
    || ' · ' || v_supplier;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    IF NULLIF(v_item->>'product_id', '') IS NULL THEN
      RAISE EXCEPTION 'Producto inválido en un ítem';
    END IF;

    BEGIN
      v_qty := (v_item->>'quantity')::NUMERIC(14, 3);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    IF NULLIF(v_item->>'unit_cost', '') IS NULL THEN
      v_unit_cost := NULL;
    ELSE
      BEGIN
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC(14, 2);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Costo unitario inválido';
      END;
      IF v_unit_cost < 0 THEN
        RAISE EXCEPTION 'Costo unitario inválido';
      END IF;
    END IF;

    v_lot := NULLIF(btrim(COALESCE(v_item->>'lot_number', '')), '');
    BEGIN
      v_expires := NULLIF(v_item->>'expires_at', '')::DATE;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Fecha de vencimiento inválida';
    END;

    SELECT * INTO v_product
    FROM public.inventory_products
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id
      AND branch_id = v_branch_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado o de otra sucursal';
    END IF;

    IF v_product.cost_currency = 'USD' THEN
      SELECT usd_ars INTO v_rate FROM public.purchase_pricing_settings WHERE organization_id = v_org_id FOR SHARE;
      IF v_rate IS NULL THEN RAISE EXCEPTION 'Configurá la cotización USD/ARS en Compras'; END IF;
    ELSE
      v_rate := 1;
    END IF;
    v_before := v_product.quantity;
    v_after := v_before + v_qty;
    v_line_total := ROUND(COALESCE(v_unit_cost, 0) * v_qty, 2);
    v_total := v_total + v_line_total;
    v_item_count := v_item_count + 1;

    UPDATE public.inventory_products
    SET
      quantity = v_after,
      unit_cost = COALESCE(round(v_unit_cost / v_rate, 2), unit_cost)
    WHERE id = v_product.id;

    INSERT INTO public.inventory_movements (
      organization_id,
      branch_id,
      product_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      lot_number,
      expires_at,
      reason,
      performed_by,
      purchase_id
    )
    VALUES (
      v_org_id,
      v_branch_id,
      v_product.id,
      'entrada',
      v_qty,
      v_before,
      v_after,
      v_lot,
      v_expires,
      v_reason,
      auth.uid(),
      v_purchase_id
    )
    RETURNING id INTO v_movement_id;

    INSERT INTO public.inventory_purchase_items (
      organization_id,
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      line_total,
      lot_number,
      expires_at,
      movement_id
    )
    VALUES (
      v_org_id,
      v_purchase_id,
      v_product.id,
      v_qty,
      v_unit_cost,
      v_line_total,
      v_lot,
      v_expires,
      v_movement_id
    );
  END LOOP;

  UPDATE public.inventory_purchases
  SET total_cost = v_total
  WHERE id = v_purchase_id;

  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'item_count', v_item_count,
    'total_cost', v_total
  );
END;
$$;
COMMIT;
