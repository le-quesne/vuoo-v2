-- Fija search_path = public, pg_temp en las 9 funciones que quedaban
-- mutables. Cierra defensa en profundidad contra search_path hijack: si
-- un atacante consiguiera ejecutar SQL arbitrario y manipular el
-- search_path del caller, las funciones SECURITY DEFINER seguirían
-- buscando objetos en public/pg_temp y no en schemas controlados por
-- el atacante. Las funciones SECURITY INVOKER reciben el mismo
-- tratamiento por consistencia (también las flagueaba el linter de
-- Supabase porque pueden ser invocadas desde contextos elevados como
-- triggers).

alter function public.is_super_admin() set search_path = public, pg_temp;
alter function public.user_org_ids() set search_path = public, pg_temp;
alter function public.admin_list_users() set search_path = public, pg_temp;
alter function public.admin_get_org_stats() set search_path = public, pg_temp;
alter function public.generate_order_number(uuid) set search_path = public, pg_temp;
alter function public.notify_on_plan_stop_change() set search_path = public, pg_temp;
alter function public.detach_order_on_plan_stop_delete() set search_path = public, pg_temp;
alter function public.orders_set_updated_at() set search_path = public, pg_temp;
alter function public.sync_order_status_from_plan_stop() set search_path = public, pg_temp;
