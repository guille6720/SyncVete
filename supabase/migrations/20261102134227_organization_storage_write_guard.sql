BEGIN;
CREATE TABLE storage_control.write_enforcement (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE storage_control.enforced_organizations (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id)
);
ALTER TABLE storage_control.write_enforcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_control.enforced_organizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage_control.write_enforcement, storage_control.enforced_organizations FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO storage_control.write_enforcement(singleton,enabled) VALUES (true,false);

CREATE FUNCTION storage_control.enforces_path(object_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT enabled FROM storage_control.write_enforcement WHERE singleton),false)
    OR EXISTS (SELECT 1 FROM storage_control.enforced_organizations
      WHERE organization_id::text = split_part(object_path,'/',1));
$$;
CREATE FUNCTION storage_control.guard_object_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_guarded boolean := false;
  new_guarded boolean;
  target_organization uuid;
  actual_bytes numeric;
BEGIN
  new_guarded := NEW.bucket_id IN ('clinical-images','patient-photos','data-migration')
    AND storage_control.enforces_path(NEW.name);
  IF TG_OP = 'UPDATE' THEN
    old_guarded := OLD.bucket_id IN ('clinical-images','patient-photos','data-migration')
      AND storage_control.enforces_path(OLD.name);
  END IF;
  IF NOT coalesce(old_guarded,false) AND NOT coalesce(new_guarded,false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF old_guarded AND (to_jsonb(NEW) - 'updated_at' - 'last_accessed_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_accessed_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'reserved storage objects are immutable; use a new path' USING ERRCODE = '42501';
  END IF;
  BEGIN
    target_organization := split_part(NEW.name,'/',1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid reserved storage path' USING ERRCODE = '22023';
  END;
  actual_bytes := CASE
    WHEN NEW.metadata ? 'size' THEN CASE
      WHEN NEW.metadata->>'size' ~ '^[0-9]+$' THEN (NEW.metadata->>'size')::numeric END
    WHEN NEW.metadata->>'contentLength' ~ '^[0-9]+$' THEN (NEW.metadata->>'contentLength')::numeric
  END;
  IF actual_bytes IS NULL OR actual_bytes <= 0 THEN
    RAISE EXCEPTION 'reserved storage size required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.organization_storage_quotas
    WHERE organization_id = target_organization FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'storage quota not configured' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public.organization_storage_reservations
    WHERE organization_id = target_organization AND bucket_id = NEW.bucket_id
      AND object_path = NEW.name AND bytes = actual_bytes AND completed_at IS NULL
      AND content_sha256 IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'matching pending storage reservation required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION storage_control.enforces_path(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION storage_control.guard_object_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER organization_storage_write_guard BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION storage_control.guard_object_write();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organization_storage_reservations, public.organization_storage_quotas FROM service_role;
CREATE FUNCTION public.get_organization_storage_guard_status(target_organization uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT storage_control.enforces_path(target_organization::text || '/');
$$;
REVOKE ALL ON FUNCTION public.get_organization_storage_guard_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_storage_guard_status(uuid) TO service_role;
COMMIT;
