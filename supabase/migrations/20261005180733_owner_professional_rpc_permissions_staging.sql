DO $$ BEGIN IF current_setting('app.owner_pwa_staging',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'STAGING ONLY'; END IF; END $$;
REVOKE ALL ON FUNCTION public.get_owner_professional_availability(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.book_owner_professional_slot(uuid,timestamptz,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lock_owner_agenda_writer() FROM PUBLIC, anon, authenticated;
