BEGIN;
REVOKE ALL ON FUNCTION public.receive_inventory_purchase(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_inventory_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inventory_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_inventory_purchases(text, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_inventory_purchase(jsonb), public.cancel_inventory_purchase(uuid), public.get_inventory_purchase(uuid), public.list_inventory_purchases(text, uuid, text, integer, integer) TO authenticated;
COMMIT;
