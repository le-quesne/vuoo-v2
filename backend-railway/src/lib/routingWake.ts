/**
 * `vuoo-routing` (OSRM) y `vroom` corren con app sleeping en Railway: si nadie
 * optimiza hace un rato, Railway apaga el contenedor y deja de cobrar la RAM.
 * El costo de eso es que la primera optimización del día llega a un servicio
 * frío, y OSRM además necesita mapear el grafo a memoria antes de contestar.
 *
 * Sin esto, esa primera petición explota con un error de red y el despachador
 * ve un 500 por el solo hecho de planificar temprano. `ensureRoutingAwake()`
 * absorbe ese arranque: sondea ambos servicios hasta que responden y recién
 * ahí deja seguir.
 *
 * Las sondas son GET idempotentes, así que reintentarlas es seguro (ver
 * `.claude/rules/04-data-services.md` → "Retry solo cuando tiene sentido").
 */

// Techo total de espera por servicio. Un OSRM frío con el grafo de la RM
// levanta en pocos segundos; 90s deja margen para un build recién desplegado
// sin dejar la request colgada indefinidamente.
const WAKE_TIMEOUT_MS = 90_000;

// Techo por intento: si el contenedor está arrancando, la conexión se queda
// esperando y sin esto el AbortController nunca corta.
const PROBE_TIMEOUT_MS = 5_000;

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5_000;

// Centro de Santiago. Sirve de sonda porque `/nearest` solo contesta Ok una vez
// que el grafo está cargado — un puerto abierto pero sin grafo no basta.
const PROBE_LNG_LAT = '-70.6693,-33.4489';

const trimSlash = (url: string): string => url.replace(/\/$/, '');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Un servicio cuenta como despierto si contesta cualquier cosa que no sea 5xx. */
async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntilAwake(name: string, url: string): Promise<void> {
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let backoff = INITIAL_BACKOFF_MS;

  for (;;) {
    if (await probe(url)) return;
    if (Date.now() >= deadline) {
      throw new Error(`${name} no respondió tras ${Math.round(WAKE_TIMEOUT_MS / 1000)}s de espera.`);
    }
    await sleep(backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
}

/**
 * Espera a que OSRM y Vroom estén sirviendo. Lanza si alguno no despierta
 * dentro del timeout — el caller debe traducir eso a un 503 legible.
 *
 * Conviene arrancarla apenas entra la request y `await`-earla recién antes de
 * usar los servicios: así el contenedor despierta en paralelo con las queries
 * a Supabase en vez de sumarse a ellas.
 */
export async function ensureRoutingAwake(): Promise<void> {
  const osrmUrl = process.env.OSRM_URL;
  const vroomUrl = process.env.VROOM_URL;

  const targets: Array<{ name: string; url: string }> = [];
  if (osrmUrl) {
    targets.push({ name: 'OSRM', url: `${trimSlash(osrmUrl)}/nearest/v1/driving/${PROBE_LNG_LAT}` });
  }
  if (vroomUrl) {
    targets.push({ name: 'Vroom', url: `${trimSlash(vroomUrl)}/` });
  }

  await Promise.all(targets.map((t) => waitUntilAwake(t.name, t.url)));
}
