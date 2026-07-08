-- =============================================
-- PRD 26 — Hardening: revocar EXECUTE de anon/authenticated
-- =============================================
--
-- Postgres otorga EXECUTE a PUBLIC por default en funciones nuevas, y
-- Supabase las expone como RPC vía PostgREST. Estas 4 funciones son
-- `security definer` y están pensadas para ser llamadas SOLO por el cron
-- nocturno (`stop-visits-nightly-batch`), nunca por un cliente autenticado
-- ni anónimo — `compute_stop_visits_for_route` en particular acepta
-- cualquier route_id sin verificar org, así que expuesta hoy permitiría a
-- cualquiera (incluso sin login) escribir `stop_visits` de una org ajena o
-- gastar cómputo gratis llamando al batch completo.
--
-- Detectado por get_advisors (security) después de aplicar las
-- migraciones de PRD 26 — no estaba en el baseline previo.

revoke execute on function public.compute_stop_visits_for_route(uuid) from anon, authenticated;
revoke execute on function public.refresh_customer_service_stats() from anon, authenticated;
revoke execute on function public.refresh_customer_pair_affinity() from anon, authenticated;
revoke execute on function public.run_stop_visits_batch(int) from anon, authenticated;
