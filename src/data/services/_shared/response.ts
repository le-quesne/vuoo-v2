export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

export function fail<T = never>(error: string): ServiceResult<T> {
  return { success: false, error };
}

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Error desconocido';
}
