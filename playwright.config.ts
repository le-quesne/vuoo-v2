import { defineConfig, devices } from '@playwright/test'

// Configuración Playwright para tests E2E del loop email (PRD 13b).
//
// Variables de entorno requeridas (todas en .env.e2e o exportadas):
//
//   E2E_APP_BASE_URL          URL del frontend (ej. http://localhost:5173 o staging)
//   E2E_SUPABASE_URL          URL del proyecto Supabase
//   E2E_SUPABASE_SERVICE_KEY  service_role JWT (para seeding directo a DB)
//   E2E_SUPABASE_ANON_KEY     anon key (para llamadas públicas como submit-feedback)
//   E2E_ADMIN_EMAIL           credencial dispatcher para login en dashboard
//   E2E_ADMIN_PASSWORD        credencial dispatcher
//
// Opcionales:
//   E2E_RESEND_TEST_KEY       si está, el test setea la key en la org seeded;
//                             si no, el test simula el envío inyectando directamente
//                             un row `sent` en notification_logs.

const baseURL = process.env.E2E_APP_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Tests tocan la misma org de seed → serializar.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
