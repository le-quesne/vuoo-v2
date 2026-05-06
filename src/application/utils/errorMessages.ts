/**
 * Convierte errores crudos de Supabase / red en mensajes legibles en español.
 * Documentado en .claude/rules/04-data-services.md.
 */
export function userMessage(raw: string | null | undefined): string {
  if (!raw) return 'Ocurrió un error inesperado.';
  if (/network|failed to fetch/i.test(raw)) {
    return 'Sin conexión. Revisa tu internet.';
  }
  if (/401|403|jwt|unauthorized|forbidden/i.test(raw)) {
    return 'Tu sesión expiró. Inicia sesión nuevamente.';
  }
  if (/duplicate key|unique constraint/i.test(raw)) {
    return 'Ya existe un registro con esos datos.';
  }
  if (/row-level security|rls|new row violates row-level/i.test(raw)) {
    return 'No tienes permisos para esta acción.';
  }
  if (/could not find the function|schema cache|404/i.test(raw)) {
    return 'Esta funcionalidad aún no está disponible. Si la necesitas, contacta a soporte.';
  }
  if (/timeout|deadline/i.test(raw)) {
    return 'El servidor demoró demasiado en responder. Intenta de nuevo.';
  }
  return raw;
}
