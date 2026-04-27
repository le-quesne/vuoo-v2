import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.js';
import { geocodeRoutes } from './routes/geocode.js';
import { ordersImportRoutes } from './routes/ordersImport.js';
import { apiTokensRoutes } from './routes/apiTokens.js';
import { vroomRoutes } from './routes/vroom.js';
import { templatesRoutes } from './routes/templates.js';

// `/api/v1/orders` (endpoint público con token opaco) requiere
// SUPABASE_SERVICE_ROLE_KEY para bypassear RLS al validar el token. No está
// registrado hasta que se provisione. Todas las demás rutas usan anon + JWT.

const app = new Hono();
// Default cubre los puertos típicos de Vite local (5173 cuando libre, 5174 si
// 5173 está ocupado). Producción/staging deben seteear CORS_ORIGIN explícito.
const DEFAULT_LOCAL_ORIGINS = 'http://localhost:5173,http://localhost:5174,http://localhost:4173';
const allowedOrigins = (process.env.CORS_ORIGIN ?? DEFAULT_LOCAL_ORIGINS)
  .split(',')
  .map((s) => s.trim());

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization', 'X-Org-Id', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'vuoo-api',
    endpoints: [
      '/vroom/optimize',
      '/geocode/batch',
      '/orders/import',
      '/settings/api-tokens',
      '/templates/orders.xlsx',
      '/templates/orders.csv',
    ],
  }),
);

// Vroom tiene su propio auth inline (anon + caller JWT).
app.route('/vroom', vroomRoutes);

// /templates es público (plantillas vacías, sin datos del cliente).
app.route('/templates', templatesRoutes);

// Resto usa el middleware con anon + caller JWT.
app.use('/geocode/*', authMiddleware);
app.use('/orders/import/*', authMiddleware);
app.use('/settings/api-tokens/*', authMiddleware);

app.route('/geocode', geocodeRoutes);
app.route('/orders/import', ordersImportRoutes);
app.route('/settings/api-tokens', apiTokensRoutes);

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[vuoo-api] listening on :${info.port}`);
});
