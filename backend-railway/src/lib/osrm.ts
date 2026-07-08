const OSRM_URL = process.env.OSRM_URL;

// Distancia/tiempo muy alto en vez de `null` para pares no alcanzables (isla
// de red vial, coordenada inválida) — así Vroom los evita en vez de recibir
// NaN. No debería aparecer en la práctica dentro de una misma ciudad/región.
const UNREACHABLE = 999_999;

export interface OsrmTableResult {
  durations: number[][];
  distances: number[][];
}

/**
 * Matriz real de duración/distancia entre todos los puntos, vía OSRM /table.
 * Usada para construir la matriz de costo propia de Vroom (PRD 26 Fase 2) —
 * separada de la matriz `durations` para no comprometer restricciones duras
 * (ventanas horarias, max_travel_time).
 */
export async function fetchOsrmTable(
  points: Array<{ lng: number; lat: number }>,
): Promise<OsrmTableResult> {
  if (!OSRM_URL) throw new Error('OSRM_URL no configurado en el entorno del backend.');
  if (points.length < 2) throw new Error('fetchOsrmTable necesita al menos 2 puntos.');

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_URL.replace(/\/$/, '')}/table/v1/driving/${coords}?annotations=duration,distance`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OSRM /table falló: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    code: string;
    durations?: Array<Array<number | null>>;
    distances?: Array<Array<number | null>>;
  };

  if (data.code !== 'Ok') {
    throw new Error(`OSRM /table respondió code=${data.code}`);
  }
  if (!data.durations || !data.distances) {
    throw new Error(
      'OSRM /table no devolvió durations/distances (falta ?annotations=duration,distance).',
    );
  }

  const clean = (m: Array<Array<number | null>>): number[][] =>
    m.map((row) => row.map((v) => (v == null ? UNREACHABLE : Math.round(v))));

  return { durations: clean(data.durations), distances: clean(data.distances) };
}
