import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, KeyRound, Terminal } from 'lucide-react';

/**
 * Documentación pública de la API de pedidos de Vuoo.
 *
 * Página standalone (sin auth, sin Layout) pensada para los desarrolladores del
 * cliente. Se sirve en `/docs/api`. El base URL de los ejemplos se lee de
 * `VITE_ROUTING_BASE_URL` para que siempre apunte al backend correcto.
 */

const BASE_URL =
  (import.meta.env.VITE_ROUTING_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://vuoo-api-production.up.railway.app';

const ENDPOINT = `${BASE_URL}/api/v1/orders`;

interface Field {
  name: string;
  type: string;
  required?: boolean;
  desc: string;
}

const REQUIRED_FIELDS: Field[] = [
  { name: 'customer_name', type: 'string', required: true, desc: 'Nombre del cliente o local que recibe (ej. "Do Sushi Providencia").' },
  { name: 'address', type: 'string', required: true, desc: 'Dirección de entrega en texto libre. Se geocodifica y se hace match contra tus lugares guardados. Podés omitirla solo si enviás customer_code.' },
];

const OPTIONAL_FIELDS: Field[] = [
  { name: 'customer_code', type: 'string', desc: 'Código del cliente en tu sistema (ERP). Vincula el pedido a tu catálogo de clientes y da el match de mayor confianza; si el código no existe, el cliente se crea automáticamente. Con customer_code podés omitir address: se usa la dirección registrada del cliente.' },
  { name: 'order_number', type: 'string', desc: 'Tu número de pedido / guía de despacho. Si lo omitís, Vuoo genera uno (ORD-00001). Único por organización — repetirlo devuelve 409.' },
  { name: 'items', type: 'array', desc: 'Líneas del pedido. Cada ítem: { name, quantity, sku? }. Ver detalle abajo.' },
  { name: 'total_weight_kg', type: 'number', desc: 'Peso total del pedido en kilos. Se usa para capacidad de vehículos en el ruteo.' },
  { name: 'total_volume_m3', type: 'number', desc: 'Volumen total en m³ (opcional, para capacidad volumétrica).' },
  { name: 'total_price', type: 'number', desc: 'Monto total del pedido.' },
  { name: 'currency', type: 'string(3)', desc: 'Código ISO de moneda. Default: CLP.' },
  { name: 'lat', type: 'number', desc: 'Latitud del destino (-90 a 90). Si la enviás, se prioriza sobre la geocodificación del texto.' },
  { name: 'lng', type: 'number', desc: 'Longitud del destino (-180 a 180).' },
  { name: 'customer_phone', type: 'string', desc: 'Teléfono de contacto (para notificaciones al cliente).' },
  { name: 'customer_email', type: 'string', desc: 'Email de contacto.' },
  { name: 'time_window_start', type: 'string "HH:MM"', desc: 'Inicio de la ventana horaria de entrega (ej. "09:00"). El formato se valida: otro formato devuelve 400.' },
  { name: 'time_window_end', type: 'string "HH:MM"', desc: 'Fin de la ventana horaria (ej. "13:00"). Ej. franja "AM" = 09:00–13:00.' },
  { name: 'requested_date', type: 'string "YYYY-MM-DD"', desc: 'Fecha solicitada de entrega. El formato se valida: otro formato devuelve 400.' },
  { name: 'service_duration_minutes', type: 'integer', desc: 'Minutos estimados de servicio en el punto. Default: 15.' },
  { name: 'priority', type: 'enum', desc: 'Prioridad: urgent · high · normal · low. Default: normal.' },
  { name: 'requires_signature', type: 'boolean', desc: 'Exige firma como prueba de entrega (POD).' },
  { name: 'requires_photo', type: 'boolean', desc: 'Exige foto como prueba de entrega.' },
  { name: 'delivery_instructions', type: 'string', desc: 'Instrucciones para el conductor (ej. "Entregar por acceso lateral").' },
  { name: 'internal_notes', type: 'string', desc: 'Notas internas, no visibles para el conductor.' },
  { name: 'tags', type: 'string[]', desc: 'Etiquetas libres para filtrar y agrupar pedidos.' },
];

const ITEM_FIELDS: Field[] = [
  { name: 'name', type: 'string', required: true, desc: 'Nombre del producto (ej. "Hielo Tradicional pack 12 kg").' },
  { name: 'quantity', type: 'integer', required: true, desc: 'Cantidad. Debe ser un entero positivo.' },
  { name: 'sku', type: 'string', desc: 'Identificador del producto en tu sistema (ej. productId de tu catálogo).' },
];

const ERRORS: Array<{ status: string; code: string; desc: string }> = [
  { status: '400', code: 'missing_idempotency_key', desc: 'Falta el header Idempotency-Key.' },
  { status: '400', code: 'invalid_body', desc: 'El cuerpo no cumple el esquema. detail trae los errores de validación.' },
  { status: '401', code: 'missing_authorization', desc: 'Falta el header Authorization.' },
  { status: '401', code: 'invalid_token', desc: 'El token no existe o es inválido.' },
  { status: '401', code: 'token_revoked', desc: 'El token fue revocado desde el panel.' },
  { status: '403', code: 'insufficient_scope', desc: 'El token no tiene el scope orders:write.' },
  { status: '409', code: 'duplicate_order_number', desc: 'Ya existe un pedido con ese order_number en tu organización. No se reintenta: corregí el número.' },
  { status: '500', code: 'match_failed', desc: 'Error interno al resolver el destino. Reintentá con la misma Idempotency-Key.' },
  { status: '500', code: 'otros códigos', desc: 'Cualquier otro 500 (stop_create_failed, order_insert_failed…) también es seguro de reintentar con la misma Idempotency-Key.' },
];

const CURL_EXAMPLE = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer vuoo_TU_TOKEN" \\
  -H "Idempotency-Key: 45663191650" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_name": "Do Sushi Providencia",
    "customer_code": "CLI-0042",
    "address": "Suecia 0155, Providencia",
    "order_number": "56680492146",
    "requested_date": "2026-08-01",
    "time_window_start": "09:00",
    "time_window_end": "13:00",
    "total_weight_kg": 72,
    "items": [
      { "name": "Hielo Tradicional (pack 12 kg)", "quantity": 4, "sku": "3926228480" },
      { "name": "Hielo Nugget (pack 12 kg)", "quantity": 2, "sku": "3926228482" },
      { "name": "Saco hielo escama 5 kg", "quantity": 4, "sku": "24668729896" }
    ]
  }'`;

const JS_EXAMPLE = `const res = await fetch("${ENDPOINT}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer vuoo_TU_TOKEN",
    "Idempotency-Key": "45663191650", // tu ID único de pedido
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    customer_name: "Do Sushi Providencia",
    customer_code: "CLI-0042",
    address: "Suecia 0155, Providencia",
    order_number: "56680492146",
    requested_date: "2026-08-01",
    time_window_start: "09:00",
    time_window_end: "13:00",
    total_weight_kg: 72,
    items: [
      { name: "Hielo Tradicional (pack 12 kg)", quantity: 4, sku: "3926228480" },
      { name: "Hielo Nugget (pack 12 kg)", quantity: 2, sku: "3926228482" },
    ],
  }),
});

const data = await res.json();
if (!res.ok) throw new Error(data.error);
console.log(data.id, data.match_quality);`;

const PYTHON_EXAMPLE = `import requests

res = requests.post(
    "${ENDPOINT}",
    headers={
        "Authorization": "Bearer vuoo_TU_TOKEN",
        "Idempotency-Key": "45663191650",  # tu ID único de pedido
    },
    json={
        "customer_name": "Do Sushi Providencia",
        "customer_code": "CLI-0042",
        "address": "Suecia 0155, Providencia",
        "order_number": "56680492146",
        "requested_date": "2026-08-01",
        "time_window_start": "09:00",
        "time_window_end": "13:00",
        "total_weight_kg": 72,
        "items": [
            {"name": "Hielo Tradicional (pack 12 kg)", "quantity": 4, "sku": "3926228480"},
            {"name": "Hielo Nugget (pack 12 kg)", "quantity": 2, "sku": "3926228482"},
        ],
    },
)
res.raise_for_status()
print(res.json())`;

const RESPONSE_201 = `HTTP/1.1 201 Created
{
  "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
  "match_quality": "high",
  "stop_id": "a1b2c3d4-..."
}`;

const RESPONSE_200 = `HTTP/1.1 200 OK
{
  "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
  "match_quality": "high",
  "stop_id": "a1b2c3d4-...",
  "idempotent": true
}`;

const NAV = [
  { id: 'intro', label: 'Introducción' },
  { id: 'auth', label: 'Autenticación' },
  { id: 'idempotency', label: 'Idempotencia' },
  { id: 'endpoint', label: 'Crear un pedido' },
  { id: 'fields', label: 'Campos del pedido' },
  { id: 'examples', label: 'Ejemplos' },
  { id: 'responses', label: 'Respuestas' },
  { id: 'errors', label: 'Códigos de error' },
  { id: 'best-practices', label: 'Buenas prácticas' },
];

export function DocsApiPage() {
  const [active, setActive] = useState('intro');

  useEffect(() => {
    document.title = 'API de Pedidos · Vuoo';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-800">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo_vuoo.svg" alt="Vuoo" className="h-7 w-7" />
            <span className="text-sm font-semibold text-gray-900">Vuoo</span>
            <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
              API Docs
            </span>
          </a>
          <a
            href={`${BASE_URL}/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 sm:flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Estado del API
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6">
        {/* Sidebar */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <nav className="space-y-1">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active === n.id
                    ? 'bg-red-50 font-medium text-red-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 py-10">
          {/* Hero */}
          <div className="mb-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
              <Terminal size={12} /> REST API · v1
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              API de Pedidos
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-600">
              Inyectá pedidos a Vuoo desde tu ERP, e-commerce o cualquier sistema con una sola
              llamada HTTP. Vuoo resuelve el destino, hace match con tus lugares guardados y deja el
              pedido listo para rutear.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-gray-900 px-3 py-1.5 font-mono text-xs text-white">
                POST /api/v1/orders
              </span>
              <span className="font-mono text-xs text-gray-400">{BASE_URL}</span>
            </div>
          </div>

          <Section id="intro" title="Introducción">
            <p>
              El endpoint público <Code>POST /api/v1/orders</Code> crea un pedido en tu organización.
              Es la vía recomendada para integraciones personalizadas (ERP, VTEX, scripts, Zapier,
              WhatsApp). Cada pedido entrante:
            </p>
            <ul className="my-4 space-y-2">
              <Bullet>Se geocodifica y se hace <em>match</em> automático contra tus lugares y clientes guardados.</Bullet>
              <Bullet>Entra al inbox de pedidos con estado <Code>pending</Code>, listo para asignar a un plan de ruta.</Bullet>
              <Bullet>Es idempotente: reenviar el mismo pedido nunca lo duplica.</Bullet>
            </ul>
            <Callout>
              Todas las llamadas usan HTTPS. El base URL de tu integración es{' '}
              <Code>{BASE_URL}</Code>.
            </Callout>
          </Section>

          <Section id="auth" title="Autenticación">
            <p>
              El API se autentica con un <strong>token de organización</strong> vía header{' '}
              <Code>Authorization: Bearer</Code>. Los tokens se crean desde el panel:
            </p>
            <div className="my-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <KeyRound size={18} className="mt-0.5 shrink-0 text-gray-400" />
              <div className="text-sm text-gray-600">
                <strong className="text-gray-900">Configuración → API &amp; Integraciones → Crear token</strong>
                <p className="mt-1">
                  Elegí el scope <Code>orders:write</Code>. El token se muestra <strong>una sola vez</strong>{' '}
                  al crearlo (formato <Code>vuoo_…</Code>) — guardalo en un lugar seguro. Si lo perdés,
                  revocalo y creá uno nuevo.
                </p>
              </div>
            </div>
            <CodeBlock
              code={`Authorization: Bearer vuoo_TU_TOKEN\nContent-Type: application/json`}
              lang="http"
            />
            <Callout tone="warn">
              Nunca expongas el token en el frontend ni en repositorios públicos. Es una credencial de
              servidor a servidor.
            </Callout>
          </Section>

          <Section id="idempotency" title="Idempotencia">
            <p>
              Toda llamada <strong>requiere</strong> el header <Code>Idempotency-Key</Code>. Usá tu
              identificador único de pedido (ej. el <em>Ticket ID</em> o número de guía de tu sistema).
            </p>
            <ul className="my-4 space-y-2">
              <Bullet>Si reenviás una llamada con la misma key, Vuoo devuelve el pedido ya creado con <Code>200 OK</Code> y <Code>"idempotent": true</Code> — no lo duplica.</Bullet>
              <Bullet>Si es una key nueva, crea el pedido y responde <Code>201 Created</Code>.</Bullet>
            </ul>
            <CodeBlock code={`Idempotency-Key: 45663191650`} lang="http" />
            <Callout>
              Esto hace seguros los reintentos: ante un timeout o error de red, podés repetir la misma
              llamada sin miedo a generar pedidos duplicados.
            </Callout>
          </Section>

          <Section id="endpoint" title="Crear un pedido">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700">
                POST
              </span>
              <span className="font-mono text-sm text-gray-700">/api/v1/orders</span>
            </div>
            <p className="font-medium text-gray-900">Headers</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  <HeaderRow name="Authorization" req desc="Bearer <tu-token> con scope orders:write." />
                  <HeaderRow name="Idempotency-Key" req desc="Identificador único de tu pedido. Dedupe garantizado." />
                  <HeaderRow name="Content-Type" req desc="application/json" />
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="fields" title="Campos del pedido">
            <p>
              El cuerpo es un objeto JSON. Solo se exige <Code>customer_name</Code> más el destino:{' '}
              <Code>address</Code>, o <Code>customer_code</Code> de un cliente con dirección registrada.
            </p>
            <FieldTable title="Requeridos" fields={REQUIRED_FIELDS} />
            <FieldTable title="Opcionales" fields={OPTIONAL_FIELDS} />
            <h3 className="mb-2 mt-8 text-sm font-semibold text-gray-900">
              Estructura de <Code>items[]</Code>
            </h3>
            <FieldTable fields={ITEM_FIELDS} />
          </Section>

          <Section id="examples" title="Ejemplos">
            <p>Un pedido de hielo con ventana de entrega AM y tres líneas:</p>
            <LangTabs
              curl={CURL_EXAMPLE}
              js={JS_EXAMPLE}
              python={PYTHON_EXAMPLE}
            />
          </Section>

          <Section id="responses" title="Respuestas">
            <p>
              En éxito, el API devuelve el <Code>id</Code> del pedido y la calidad del match contra tus
              lugares guardados.
            </p>
            <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-900">Pedido creado</h3>
            <CodeBlock code={RESPONSE_201} lang="json" />
            <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-900">
              Pedido ya existía (idempotente)
            </h3>
            <CodeBlock code={RESPONSE_200} lang="json" />
            <h3 className="mb-3 mt-8 text-sm font-semibold text-gray-900">
              El campo <Code>match_quality</Code>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  <MatchRow q="high" color="emerald" desc="Match exacto con un lugar/cliente guardado. Listo para rutear." />
                  <MatchRow q="medium" color="amber" desc="Match probable — se marca para revisión manual en el panel." />
                  <MatchRow q="low" color="orange" desc="Match débil. Se crea el pedido pero conviene verificar la dirección." />
                  <MatchRow q="none" color="gray" desc="Sin match: se creó un lugar nuevo con la dirección recibida (o el pedido quedó pendiente de dirección si solo enviaste customer_code)." />
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="errors" title="Códigos de error">
            <p>
              Los errores devuelven un JSON con <Code>error</Code> (código estable) y, cuando aplica,{' '}
              <Code>detail</Code>.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 font-medium">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ERRORS.map((e) => (
                    <tr key={e.code}>
                      <td className="py-2.5 pr-4 align-top">
                        <span className="font-mono text-xs text-gray-500">{e.status}</span>
                      </td>
                      <td className="py-2.5 pr-4 align-top">
                        <code className="font-mono text-xs text-red-600">{e.code}</code>
                      </td>
                      <td className="py-2.5 align-top text-gray-600">{e.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="best-practices" title="Buenas prácticas">
            <ul className="space-y-3">
              <Bullet>
                <strong>Usá un Idempotency-Key estable</strong> por pedido (tu Ticket ID o guía). Así los
                reintentos nunca duplican.
              </Bullet>
              <Bullet>
                <strong>Enviá coordenadas</strong> (<Code>lat</Code>/<Code>lng</Code>) cuando las tengas:
                mejora la precisión del ruteo y evita ambigüedades de geocodificación.
              </Bullet>
              <Bullet>
                <strong>Enviá <Code>customer_code</Code></strong> si tu ERP maneja códigos de cliente:
                es la señal de match más confiable y evita revisiones manuales por nombres escritos
                distinto.
              </Bullet>
              <Bullet>
                <strong>Completá <Code>total_weight_kg</Code></strong> si tu operación tiene restricciones
                de capacidad por vehículo — es clave para que el optimizador reparta bien la carga.
              </Bullet>
              <Bullet>
                <strong>Reintentá los <Code>500</Code></strong> con backoff exponencial y la misma key. Los{' '}
                <Code>4xx</Code> no se reintentan: corregí el request.
              </Bullet>
              <Bullet>
                <strong>Revisá los pedidos con <Code>match_quality: medium</Code></strong> en el panel — son
                los que Vuoo no pudo asociar con total certeza.
              </Bullet>
            </ul>
          </Section>

          <footer className="mt-16 border-t border-gray-100 pt-8 text-sm text-gray-400">
            <p>
              ¿Necesitás ayuda con tu integración? Escribinos y te acompañamos en la puesta en marcha.
            </p>
            <p className="mt-2">© {new Date().getFullYear()} Vuoo · Ruteo y logística de última milla</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────── Subcomponentes ─────────────────────────── */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-gray-100 py-10 first:border-t-0 first:pt-0">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-gray-900">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800">
      {children}
    </code>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <ChevronRight size={16} className="mt-1 shrink-0 text-red-400" />
      <span>{children}</span>
    </li>
  );
}

function Callout({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const styles =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  return <div className={`my-4 rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no-op */
    }
  }
  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-relaxed text-gray-100">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

function LangTabs({ curl, js, python }: { curl: string; js: string; python: string }) {
  const [tab, setTab] = useState<'curl' | 'js' | 'python'>('curl');
  const map = useMemo(
    () => ({ curl: { code: curl, lang: 'bash' }, js: { code: js, lang: 'javascript' }, python: { code: python, lang: 'python' } }),
    [curl, js, python],
  );
  const tabs: Array<{ id: 'curl' | 'js' | 'python'; label: string }> = [
    { id: 'curl', label: 'cURL' },
    { id: 'js', label: 'JavaScript' },
    { id: 'python', label: 'Python' },
  ];
  return (
    <div className="my-4">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CodeBlock code={map[tab].code} lang={map[tab].lang} />
    </div>
  );
}

function FieldTable({ title, fields }: { title?: string; fields: Field[] }) {
  return (
    <div className="mt-6">
      {title && (
        <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {fields.map((f) => (
              <tr key={f.name}>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <code className="font-mono text-[13px] font-medium text-gray-900">{f.name}</code>
                  {f.required && (
                    <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600">
                      req
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className="font-mono text-xs text-gray-400">{f.type}</span>
                </td>
                <td className="px-4 py-3 align-top text-gray-600">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderRow({ name, req, desc }: { name: string; req?: boolean; desc: string }) {
  return (
    <tr>
      <td className="whitespace-nowrap py-2.5 pr-4 align-top">
        <code className="font-mono text-[13px] font-medium text-gray-900">{name}</code>
        {req && (
          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600">
            req
          </span>
        )}
      </td>
      <td className="py-2.5 align-top text-gray-600">{desc}</td>
    </tr>
  );
}

function MatchRow({ q, color, desc }: { q: string; color: string; desc: string }) {
  const dot: Record<string, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-400',
  };
  return (
    <tr>
      <td className="whitespace-nowrap py-2.5 pr-4 align-top">
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot[color]}`} />
          <code className="font-mono text-[13px] text-gray-900">{q}</code>
        </span>
      </td>
      <td className="py-2.5 align-top text-gray-600">{desc}</td>
    </tr>
  );
}

export default DocsApiPage;
