// Tipos para la tabla import_templates (PRD 12, Fase A).
// TODO: regenerar database.ts cuando la migración se aplique.

export type ImportTemplateSource =
  | 'csv'
  | 'xlsx'
  | 'shopify'
  | 'vtex'
  | string;

export interface ImportTemplateColumnMap {
  // alias de columna (canonical) -> lista de posibles encabezados en el CSV
  [canonical: string]: string[];
}

export interface ImportTemplateDefaults {
  service_minutes?: number;
  priority?: number;
  requires_signature?: boolean;
  requires_photo?: boolean;
  country?: string;
  [key: string]: unknown;
}

export interface ImportTemplate {
  id: string;
  org_id: string;
  name: string;
  source: ImportTemplateSource;
  column_map: ImportTemplateColumnMap;
  defaults: ImportTemplateDefaults;
  created_by: string | null;
  created_at: string;
}

export interface ImportTemplateInsert {
  id?: string;
  org_id: string;
  name: string;
  source?: ImportTemplateSource;
  column_map: ImportTemplateColumnMap;
  defaults?: ImportTemplateDefaults;
  created_by?: string | null;
  created_at?: string;
}

export type ImportTemplateUpdate = Partial<
  Omit<ImportTemplateInsert, 'org_id'>
>;
