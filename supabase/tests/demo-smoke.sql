-- =============================================================
-- Demo smoke tests — run estas queries en Supabase Studio
-- después de cualquier cambio al seed/reset/simulator.
-- Cada bloque debe imprimir un OK; si imprime FAIL, hay regresión.
-- =============================================================

\echo '== TEST 1: hay exactamente 1 org demo activa'
SELECT
  CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FAIL: ' || count(*) || ' orgs is_demo=true' END
FROM organizations WHERE is_demo = true;

\echo '== TEST 2: la org demo tiene 80 stops y 5 plans'
SELECT
  CASE
    WHEN (SELECT count(*) FROM stops s
           JOIN organizations o ON o.id = s.org_id
          WHERE o.is_demo = true) = 80
     AND (SELECT count(*) FROM plans p
           JOIN organizations o ON o.id = p.org_id
          WHERE o.is_demo = true) = 5
    THEN 'OK'
    ELSE 'FAIL: stops=' || (SELECT count(*) FROM stops s JOIN organizations o ON o.id=s.org_id WHERE o.is_demo)
         || ' plans=' || (SELECT count(*) FROM plans p JOIN organizations o ON o.id=p.org_id WHERE o.is_demo)
  END;

\echo '== TEST 3: todos los plan_stops del demo tienen meta.simulated=true'
SELECT
  CASE
    WHEN (SELECT count(*) FROM plan_stops ps
           JOIN organizations o ON o.id = ps.org_id
          WHERE o.is_demo = true
            AND (ps.meta ->> 'simulated') IS DISTINCT FROM 'true') = 0
    THEN 'OK'
    ELSE 'FAIL: hay plan_stops sin meta.simulated en demo'
  END;

\echo '== TEST 4: ningún plan_stop fuera de demo tiene meta.simulated=true'
SELECT
  CASE
    WHEN (SELECT count(*) FROM plan_stops ps
           JOIN organizations o ON o.id = ps.org_id
          WHERE o.is_demo = false
            AND ps.meta ->> 'simulated' = 'true') = 0
    THEN 'OK'
    ELSE 'FAIL: hay plan_stops fuera de demo con flag simulated'
  END;

\echo '== TEST 5: reset_demo_org rechaza orgs no-demo (RAISE EXCEPTION)'
DO $$
DECLARE
  v_real_org uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_real_org FROM organizations WHERE is_demo = false LIMIT 1;
  IF v_real_org IS NULL THEN
    RAISE NOTICE 'TEST 5: SKIP — no hay orgs reales para verificar';
    RETURN;
  END IF;
  BEGIN
    PERFORM public.reset_demo_org(v_real_org);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF v_caught THEN
    RAISE NOTICE 'TEST 5: OK';
  ELSE
    RAISE NOTICE 'TEST 5: FAIL — reset_demo_org NO levantó excepción para org real';
  END IF;
END $$;

\echo '== TEST 6: idempotencia — seed_demo_org dos veces NO duplica'
DO $$
DECLARE
  v_demo_org uuid;
  v_stops_before int;
  v_stops_after int;
BEGIN
  SELECT id INTO v_demo_org FROM organizations WHERE is_demo = true LIMIT 1;
  SELECT count(*) INTO v_stops_before FROM stops WHERE org_id = v_demo_org;
  PERFORM public.seed_demo_org(v_demo_org);
  SELECT count(*) INTO v_stops_after FROM stops WHERE org_id = v_demo_org;
  IF v_stops_before = v_stops_after THEN
    RAISE NOTICE 'TEST 6: OK (% stops, sin duplicación)', v_stops_after;
  ELSE
    RAISE NOTICE 'TEST 6: FAIL — stops % → %', v_stops_before, v_stops_after;
  END IF;
END $$;

\echo '== TEST 7: trigger limpia meta.simulated cuando user-edit ocurre'
-- (simulación: actualizar como service-role no debería disparar el trigger)
DO $$
DECLARE
  v_test_id uuid;
  v_after jsonb;
BEGIN
  SELECT id INTO v_test_id FROM stops
   WHERE meta ->> 'simulated' = 'true' LIMIT 1;
  IF v_test_id IS NULL THEN
    RAISE NOTICE 'TEST 7: SKIP — no stops con simulated=true';
    RETURN;
  END IF;
  -- service-role update: trigger should NOT clear flag (auth.uid() is null)
  UPDATE stops SET duration_minutes = duration_minutes WHERE id = v_test_id;
  SELECT meta INTO v_after FROM stops WHERE id = v_test_id;
  IF v_after ? 'simulated' THEN
    RAISE NOTICE 'TEST 7: OK — service-role update preserva meta.simulated';
  ELSE
    RAISE NOTICE 'TEST 7: FAIL — service-role update borró meta.simulated';
  END IF;
END $$;

\echo '== TEST 8: smoke fotos POD resuelven a URL pública'
SELECT
  CASE
    WHEN count(*) > 0 AND
         bool_and(
           (img LIKE 'https://%' OR img LIKE 'http://%')
         ) THEN 'OK (' || count(*) || ' urls)'
    ELSE 'FAIL: hay paths que no son URLs http(s)'
  END
FROM (
  SELECT unnest(report_images) AS img
    FROM plan_stops ps
    JOIN organizations o ON o.id = ps.org_id
   WHERE o.is_demo = true
     AND ps.report_images IS NOT NULL
) sub;

\echo '== TEST 9: cron jobs activos'
SELECT
  CASE
    WHEN count(*) FILTER (WHERE jobname = 'demo_simulator_tick' AND active) = 1
     AND count(*) FILTER (WHERE jobname = 'demo_reset_hourly' AND active) = 1
    THEN 'OK'
    ELSE 'FAIL: cron jobs faltantes/inactivos'
  END
FROM cron.job;

\echo '== TEST 10: simulator tick sólo toca registros simulated'
DO $$
DECLARE
  v_before int;
  v_after  int;
BEGIN
  -- count of plan_stops without simulated flag
  SELECT count(*) INTO v_before FROM plan_stops
   WHERE meta ->> 'simulated' IS DISTINCT FROM 'true';
  PERFORM public.demo_simulator_tick();
  SELECT count(*) INTO v_after FROM plan_stops
   WHERE meta ->> 'simulated' IS DISTINCT FROM 'true';
  IF v_before = v_after THEN
    RAISE NOTICE 'TEST 10: OK';
  ELSE
    RAISE NOTICE 'TEST 10: FAIL — simulator afectó registros no-simulated';
  END IF;
END $$;
