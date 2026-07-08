-- =============================================
-- PRD 26 — Hardening (fix): el grant real estaba en PUBLIC
-- =============================================
--
-- La migración anterior (20260707190000) revocó EXECUTE de anon/authenticated
-- directamente, pero Postgres otorga EXECUTE a PUBLIC por default en
-- funciones nuevas — anon/authenticated seguían teniendo acceso vía su
-- membresía implícita en PUBLIC. Confirmado con
-- `has_function_privilege('anon', ..., 'EXECUTE')` devolviendo `true`
-- después de la migración anterior. Hay que revocar de PUBLIC explícitamente.

revoke execute on function public.compute_stop_visits_for_route(uuid) from public;
revoke execute on function public.refresh_customer_service_stats() from public;
revoke execute on function public.refresh_customer_pair_affinity() from public;
revoke execute on function public.run_stop_visits_batch(int) from public;
