BEGIN;
GRANT EXECUTE ON FUNCTION storage_control.enforces_path(text) TO authenticated;
CREATE POLICY storage_reserved_insert_only ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (bucket_id NOT IN ('clinical-images','patient-photos','data-migration')
  OR NOT storage_control.enforces_path(name)
  OR storage_control.can_insert(bucket_id,name,metadata));
CREATE POLICY storage_reserved_anon_insert_only ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon
WITH CHECK (bucket_id NOT IN ('clinical-images','patient-photos','data-migration'));
CREATE POLICY storage_reserved_update_only ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon, authenticated
USING (bucket_id NOT IN ('clinical-images','patient-photos','data-migration') OR NOT storage_control.enforces_path(name))
WITH CHECK (bucket_id NOT IN ('clinical-images','patient-photos','data-migration') OR NOT storage_control.enforces_path(name));
COMMIT;
