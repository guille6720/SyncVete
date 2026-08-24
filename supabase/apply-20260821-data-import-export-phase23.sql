-- Data Import/Export Phase 23: branch-aware specialty imports (checklist + notes).
-- App resolves optional external_branch_id via branchIdByExternal; never silent fallback.
-- Additive. Staging first. Tenant-safe.

CREATE OR REPLACE FUNCTION public.own_data_migration_checklist()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_items JSONB := '[]'::jsonb;
  v_branches INT;
  v_owners INT;
  v_patients INT;
  v_appts INT;
  v_vacc_due INT;
  v_hosp INT;
  v_inv INT;
  v_invoices INT;
  v_payments INT;
  v_paid_no_pay INT;
  v_mismatch INT;
  v_open_balance NUMERIC;
  v_orphans INT;
  v_stuck INT;
  v_failed INT;
  v_completed INT;
  v_score INT := 0;
  v_total INT := 0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT (
    public.has_permission('data:import')
    OR public.has_permission('data:export')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COUNT(*) INTO v_branches
  FROM public.branches WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_owners
  FROM public.owners WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_patients
  FROM public.patients WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_appts
  FROM public.appointments
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND starts_at >= timezone('utc', now())
    AND starts_at < timezone('utc', now()) + interval '30 days';

  SELECT COUNT(*) INTO v_vacc_due
  FROM public.vaccinations
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND next_due_at IS NOT NULL
    AND next_due_at::date >= (timezone('utc', now()))::date
    AND next_due_at::date <= (timezone('utc', now()) + interval '90 days')::date;

  SELECT COUNT(*) INTO v_hosp
  FROM public.hospitalizations
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND status IN ('internado', 'observacion');

  SELECT COUNT(*) INTO v_inv
  FROM public.inventory_products
  WHERE organization_id = v_org AND deleted_at IS NULL AND is_active;

  SELECT COUNT(*) INTO v_invoices
  FROM public.invoices
  WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_payments
  FROM public.payments
  WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_paid_no_pay
  FROM public.invoices i
  WHERE i.organization_id = v_org
    AND i.deleted_at IS NULL
    AND i.paid_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.organization_id = v_org
        AND p.invoice_id = i.id
        AND p.deleted_at IS NULL
    );

  SELECT COUNT(*) INTO v_mismatch
  FROM public.invoices i
  WHERE i.organization_id = v_org
    AND i.deleted_at IS NULL
    AND ABS(
      COALESCE(i.paid_amount, 0) - COALESCE((
        SELECT SUM(p.amount) FROM public.payments p
        WHERE p.organization_id = v_org
          AND p.invoice_id = i.id
          AND p.deleted_at IS NULL
      ), 0)
    ) > 0.009;

  SELECT COALESCE(SUM(balance), 0) INTO v_open_balance
  FROM public.invoices
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND status IN ('emitida', 'borrador')
    AND balance > 0;

  SELECT COUNT(*) INTO v_orphans
  FROM public.data_import_id_map m
  WHERE m.organization_id = v_org
    AND (
      (m.entity_type = 'branches' AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = m.internal_id AND b.organization_id = v_org))
      OR (m.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = m.internal_id AND o.organization_id = v_org))
      OR (m.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = m.internal_id AND p.organization_id = v_org))
      OR (m.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = m.internal_id AND a.organization_id = v_org))
      OR (m.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = m.internal_id AND i.organization_id = v_org))
      OR (m.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = m.internal_id AND inv.organization_id = v_org))
      OR (m.entity_type = 'payments' AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = m.internal_id AND p.organization_id = v_org))
    );

  SELECT
    (
      SELECT COUNT(*) FROM public.data_import_batches b
      WHERE b.organization_id = v_org
        AND b.status IN ('queued', 'importing')
        AND b.worker_locked_at IS NOT NULL
        AND b.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    ) + (
      SELECT COUNT(*) FROM public.data_export_jobs j
      WHERE j.organization_id = v_org
        AND j.status IN ('queued', 'running')
        AND j.worker_locked_at IS NOT NULL
        AND j.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    )
  INTO v_stuck;

  SELECT COUNT(*) INTO v_failed
  FROM public.data_import_batches
  WHERE organization_id = v_org
    AND status = 'failed'
    AND created_at >= timezone('utc', now()) - interval '7 days';

  SELECT COUNT(*) INTO v_completed
  FROM public.data_import_batches
  WHERE organization_id = v_org
    AND status IN ('completed', 'completed_with_warnings');

  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'branches',
    'label', 'Sucursales activas',
    'status', CASE WHEN v_branches > 0 THEN 'ok' ELSE 'fail' END,
    'count', v_branches,
    'detail', CASE WHEN v_branches > 0 THEN 'Hay sucursales (mapa multi-sede disponible)' ELSE 'Falta al menos una sucursal' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'owners',
    'label', 'Propietarios activos',
    'status', CASE WHEN v_owners > 0 THEN 'ok' ELSE 'fail' END,
    'count', v_owners,
    'detail', CASE WHEN v_owners > 0 THEN 'Hay tutores en el tenant' ELSE 'No hay propietarios importados/creados' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'patients',
    'label', 'Pacientes activos',
    'status', CASE WHEN v_patients > 0 THEN 'ok' ELSE 'fail' END,
    'count', v_patients,
    'detail', CASE WHEN v_patients > 0 THEN 'Hay pacientes en el tenant' ELSE 'No hay pacientes' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'appointments_next_30d',
    'label', 'Citas próximos 30 días',
    'status', CASE WHEN v_appts > 0 THEN 'ok' WHEN v_completed > 0 THEN 'warn' ELSE 'warn' END,
    'count', v_appts,
    'detail', 'Agenda operativa inmediata post cutover'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'vaccinations_due_90d',
    'label', 'Vacunas con próximo vencimiento (90d)',
    'status', CASE WHEN v_vacc_due > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_vacc_due,
    'detail', 'Útil para recordatorios y controles'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'active_hospitalizations',
    'label', 'Internaciones activas',
    'status', 'ok',
    'count', v_hosp,
    'detail', 'Informativo: pacientes internados ahora'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'inventory_products',
    'label', 'Productos de inventario activos',
    'status', CASE WHEN v_inv > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_inv,
    'detail', 'Stock/farmacia listo para el día a día'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'invoices',
    'label', 'Facturas registradas',
    'status', CASE WHEN v_invoices > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_invoices,
    'detail', 'Histórico comercial importable'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'payments',
    'label', 'Pagos registrados (sin caja)',
    'status', CASE WHEN v_payments > 0 THEN 'ok' WHEN v_invoices = 0 THEN 'warn' ELSE 'warn' END,
    'count', v_payments,
    'detail', 'Detalle histórico de cobros; no generan movimientos de caja'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'paid_without_payment_rows',
    'label', 'Facturas con pagado>0 sin filas de pago',
    'status', CASE WHEN v_paid_no_pay = 0 THEN 'ok' ELSE 'warn' END,
    'count', v_paid_no_pay,
    'detail', CASE WHEN v_paid_no_pay = 0 THEN 'Cobertura de pagos coherente' ELSE 'Importá payments.csv o revisá paid_amount' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'billing_paid_vs_payments',
    'label', 'Desvíos paid_amount vs suma de pagos',
    'status', CASE WHEN v_mismatch = 0 THEN 'ok' ELSE 'warn' END,
    'count', v_mismatch,
    'detail', CASE WHEN v_mismatch = 0 THEN 'Sin desvíos' ELSE 'Descargá conciliación de facturación' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'open_invoice_balance',
    'label', 'Saldo abierto en facturas',
    'status', CASE WHEN v_open_balance = 0 THEN 'ok' ELSE 'warn' END,
    'count', ROUND(v_open_balance)::INT,
    'detail', CASE
      WHEN v_open_balance = 0 THEN 'Sin saldos pendientes relevantes'
      ELSE 'Hay saldos abiertos; revisá cobranzas antes/después del cutover'
    END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'orphan_id_map',
    'label', 'Mapas id-map huérfanos (incl. sucursales/facturas/pagos)',
    'status', CASE WHEN v_orphans = 0 THEN 'ok' ELSE 'warn' END,
    'count', v_orphans,
    'detail', CASE WHEN v_orphans = 0 THEN 'Sin huérfanos detectados' ELSE 'Revisá poda de huérfanos' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'stuck_locks',
    'label', 'Locks de workers trabados',
    'status', CASE WHEN v_stuck = 0 THEN 'ok' ELSE 'fail' END,
    'count', v_stuck,
    'detail', CASE WHEN v_stuck = 0 THEN 'Sin locks stale' ELSE 'Liberá locks antes del go-live' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'failed_imports_7d',
    'label', 'Imports fallidos (7 días)',
    'status', CASE WHEN v_failed = 0 THEN 'ok' ELSE 'warn' END,
    'count', v_failed,
    'detail', CASE WHEN v_failed = 0 THEN 'Sin fallos recientes' ELSE 'Revisá errores CSV / reintentos' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'completed_imports',
    'label', 'Lotes de import completados',
    'status', CASE WHEN v_completed > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_completed,
    'detail', 'Historial de migraciones aplicadas'
  ));

  SELECT COUNT(*) INTO v_total FROM jsonb_array_elements(v_items);
  SELECT COUNT(*) INTO v_score
  FROM jsonb_array_elements(v_items) AS e(item)
  WHERE e.item->>'status' = 'ok';

  RETURN jsonb_build_object(
    'organization_id', v_org,
    'generated_at', timezone('utc', now()),
    'score_ok', v_score,
    'score_total', v_total,
    'ready_for_golive', (
      v_branches > 0 AND v_owners > 0 AND v_patients > 0 AND v_stuck = 0
    ),
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.own_data_migration_checklist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_migration_checklist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_migration_checklist() TO service_role;

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 23: checklist includes branches; specialty imports may map external_branch_id.';
