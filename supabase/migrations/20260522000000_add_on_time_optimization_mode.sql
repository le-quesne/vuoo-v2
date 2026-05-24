-- Agrega el modo 'on_time' al CHECK constraint de default_optimization_mode.
-- Útil para clientes con SLA estricto (farmacia, food delivery, B2B con multa por atraso).
-- El backend (Vroom gateway) cambia el peso del costo por hora para que el solver
-- prefiera rutas que respetan ventanas horarias sobre rutas más cortas.

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_opt_mode_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_opt_mode_check CHECK (
    default_optimization_mode IN (
      'efficiency',
      'balance_stops',
      'balance_time',
      'consolidate',
      'on_time'
    )
  );
