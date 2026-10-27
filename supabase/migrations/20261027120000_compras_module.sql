-- Compras: recepciones de compra que ingresan stock al inventario

CREATE TYPE public.inventory_purchase_status AS ENUM (
  'recibida',
  'anulada'
);

CREATE TABLE public.inventory_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL CHECK (char_length(supplier_name) BETWEEN 1 AND 160),
  invoice_number TEXT,
  purchased_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  notes TEXT,
  status public.inventory_purchase_status NOT NULL DEFAULT 'recibida',
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT inventory_purchases_invoice_len CHECK (
    invoice_number IS NULL OR char_length(invoice_number) BETWEEN 1 AND 80
  ),
  CONSTRAINT inventory_purchases_notes_len CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  )
);

CREATE INDEX idx_inventory_purchases_org_date
  ON public.inventory_purchases (organization_id, purchased_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_purchases_branch
  ON public.inventory_purchases (organization_id, branch_id, purchased_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE public.inventory_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_id UUID NOT NULL REFERENCES public.inventory_purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  lot_number TEXT,
  expires_at DATE,
  movement_id UUID REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT inventory_purchase_items_lot_len CHECK (
    lot_number IS NULL OR char_length(lot_number) BETWEEN 1 AND 80
  )
);

CREATE INDEX idx_inventory_purchase_items_purchase
  ON public.inventory_purchase_items (purchase_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_purchase_items_product
  ON public.inventory_purchase_items (product_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES public.inventory_purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_purchase
  ON public.inventory_movements (purchase_id)
  WHERE deleted_at IS NULL AND purchase_id IS NOT NULL;

CREATE TRIGGER trg_inventory_purchases_updated_at
  BEFORE UPDATE ON public.inventory_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_inventory_purchase_items_updated_at
  BEFORE UPDATE ON public.inventory_purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_inventory_purchases
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER trg_audit_inventory_purchase_items
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.inventory_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_purchases_select_tenant" ON public.inventory_purchases
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('inventory:read')
  );

CREATE POLICY "inventory_purchases_insert_tenant" ON public.inventory_purchases
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('inventory:write')
  );

CREATE POLICY "inventory_purchases_update_tenant" ON public.inventory_purchases
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('inventory:write')
  );

CREATE POLICY "inventory_purchase_items_select_tenant" ON public.inventory_purchase_items
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('inventory:read')
  );

CREATE POLICY "inventory_purchase_items_insert_tenant" ON public.inventory_purchase_items
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('inventory:write')
  );

CREATE POLICY "inventory_purchase_items_update_tenant" ON public.inventory_purchase_items
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('inventory:write')
  );

CREATE OR REPLACE FUNCTION public.list_inventory_purchases(
  p_search TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  supplier_name TEXT,
  invoice_number TEXT,
  purchased_at DATE,
  notes TEXT,
  status public.inventory_purchase_status,
  total_cost NUMERIC,
  received_by UUID,
  received_by_name TEXT,
  item_count BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_page INT;
  v_page_size INT;
  v_search TEXT;
  v_status public.inventory_purchase_status;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('inventory:read') THEN
    RETURN;
  END IF;

  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');

  IF NULLIF(btrim(COALESCE(p_status, '')), '') IS NOT NULL THEN
    BEGIN
      v_status := NULLIF(btrim(p_status), '')::public.inventory_purchase_status;
    EXCEPTION WHEN others THEN
      v_status := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.id,
      p.organization_id,
      p.branch_id,
      p.supplier_name,
      p.invoice_number,
      p.purchased_at,
      p.notes,
      p.status,
      p.total_cost,
      p.received_by,
      COALESCE(prof.full_name, u.email::text) AS received_by_name,
      (
        SELECT COUNT(*)::BIGINT
        FROM public.inventory_purchase_items i
        WHERE i.purchase_id = p.id
          AND i.deleted_at IS NULL
      ) AS item_count,
      p.created_at,
      p.updated_at
    FROM public.inventory_purchases p
    LEFT JOIN public.profiles prof ON prof.id = p.received_by
    LEFT JOIN auth.users u ON u.id = p.received_by
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND (v_status IS NULL OR p.status = v_status)
      AND (
        v_search IS NULL
        OR p.supplier_name ILIKE '%' || v_search || '%'
        OR COALESCE(p.invoice_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(p.notes, '') ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*)::BIGINT AS total_count FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.supplier_name,
    f.invoice_number,
    f.purchased_at,
    f.notes,
    f.status,
    f.total_cost,
    f.received_by,
    f.received_by_name,
    f.item_count,
    f.created_at,
    f.updated_at,
    c.total_count
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.purchased_at DESC, f.created_at DESC
  OFFSET (v_page - 1) * v_page_size
  LIMIT v_page_size;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_purchase public.inventory_purchases%ROWTYPE;
  v_received_by_name TEXT;
  v_items JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('inventory:read') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_purchase
  FROM public.inventory_purchases
  WHERE id = p_purchase_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    (SELECT prof.full_name FROM public.profiles prof WHERE prof.id = v_purchase.received_by),
    (SELECT u.email::text FROM auth.users u WHERE u.id = v_purchase.received_by)
  )
  INTO v_received_by_name;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'product_id', i.product_id,
      'product_name', pr.name,
      'product_sku', pr.sku,
      'product_unit', pr.unit,
      'quantity', i.quantity,
      'unit_cost', i.unit_cost,
      'line_total', i.line_total,
      'lot_number', i.lot_number,
      'expires_at', i.expires_at,
      'movement_id', i.movement_id
    )
    ORDER BY i.created_at ASC
  ), '[]'::jsonb)
  INTO v_items
  FROM public.inventory_purchase_items i
  JOIN public.inventory_products pr ON pr.id = i.product_id
  WHERE i.purchase_id = v_purchase.id
    AND i.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'id', v_purchase.id,
    'organization_id', v_purchase.organization_id,
    'branch_id', v_purchase.branch_id,
    'supplier_name', v_purchase.supplier_name,
    'invoice_number', v_purchase.invoice_number,
    'purchased_at', v_purchase.purchased_at,
    'notes', v_purchase.notes,
    'status', v_purchase.status,
    'total_cost', v_purchase.total_cost,
    'received_by', v_purchase.received_by,
    'received_by_name', v_received_by_name,
    'created_at', v_purchase.created_at,
    'updated_at', v_purchase.updated_at,
    'items', v_items
  );
END;
$$;

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

    v_before := v_product.quantity;
    v_after := v_before + v_qty;
    v_line_total := ROUND(COALESCE(v_unit_cost, 0) * v_qty, 2);
    v_total := v_total + v_line_total;
    v_item_count := v_item_count + 1;

    UPDATE public.inventory_products
    SET
      quantity = v_after,
      unit_cost = COALESCE(v_unit_cost, unit_cost)
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

CREATE OR REPLACE FUNCTION public.cancel_inventory_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_purchase public.inventory_purchases%ROWTYPE;
  v_item RECORD;
  v_product public.inventory_products%ROWTYPE;
  v_before NUMERIC(14, 3);
  v_after NUMERIC(14, 3);
  v_reversed INT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('inventory:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  SELECT * INTO v_purchase
  FROM public.inventory_purchases
  WHERE id = p_purchase_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  IF v_purchase.status = 'anulada' THEN
    RAISE EXCEPTION 'La compra ya está anulada';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.inventory_purchase_items
    WHERE purchase_id = v_purchase.id
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    SELECT * INTO v_product
    FROM public.inventory_products
    WHERE id = v_item.product_id
      AND organization_id = v_org_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto de la compra no encontrado';
    END IF;

    IF v_product.quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para anular la compra (producto %)', v_product.name;
    END IF;

    v_before := v_product.quantity;
    v_after := v_before - v_item.quantity;

    UPDATE public.inventory_products
    SET quantity = v_after
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
      v_purchase.branch_id,
      v_product.id,
      'salida',
      v_item.quantity,
      v_before,
      v_after,
      v_item.lot_number,
      v_item.expires_at,
      'Anulación de compra',
      auth.uid(),
      v_purchase.id
    );

    v_reversed := v_reversed + 1;
  END LOOP;

  UPDATE public.inventory_purchases
  SET status = 'anulada'
  WHERE id = v_purchase.id;

  RETURN jsonb_build_object(
    'purchase_id', v_purchase.id,
    'reversed_items', v_reversed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_inventory_purchases TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_purchase TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_inventory_purchase TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_inventory_purchase TO authenticated;
