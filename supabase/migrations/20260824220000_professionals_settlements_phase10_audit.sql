-- Professionals & Settlements Phase 10: audit trail for manual adjustments.
-- STAGING FIRST. Additive.

DROP TRIGGER IF EXISTS trg_audit_professional_settlement_adjustments
  ON public.professional_settlement_adjustments;

CREATE TRIGGER trg_audit_professional_settlement_adjustments
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_settlement_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
