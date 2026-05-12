-- Configura modo de optimización por defecto a nivel de organización.
-- El modo se usa como default en VroomWizardModal y en el flujo one-click.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_optimization_mode TEXT NOT NULL DEFAULT 'efficiency'
    CONSTRAINT organizations_opt_mode_check CHECK (
      default_optimization_mode IN ('efficiency', 'balance_stops', 'balance_time', 'consolidate')
    ),
  ADD COLUMN IF NOT EXISTS default_return_to_depot BOOLEAN NOT NULL DEFAULT TRUE;
