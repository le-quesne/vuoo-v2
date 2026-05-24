# PRD 13 — Loop Experiencia Cliente End-to-End

**Pri**: P0
**Extiende**: PRD 03 — Experiencia Cliente
**Estado**: Esquema en DB listo (migration 005). Falta UI pública + Edge
Functions + integración con proveedores.

---

## Contexto

Las tablas existen desde migration 005: `tracking_token`, `customer_*`,
`notification_logs`, `delivery_feedback`, `org_notification_settings`. Sin
embargo, el loop end-to-end nunca se cerró:

- No hay página pública que el cliente final pueda abrir.
- No hay Edge Function que envíe WhatsApp/email/SMS.
- No hay captura de feedback ni dashboard NPS.

Sin esto, los prospectos retail LATAM (Falabella, Ripley, Cencosud, Walmart)
descartan a Vuoo en demo. SimpliRoute, Beetrack, Routal y Shipsy lo tienen
todos completo y nativo.

---

## Objetivos

1. El destinatario recibe notificación con link `/track/:token` apenas el
   chofer arranca la ruta.
2. La página de tracking muestra mapa en vivo, ETA dinámico y timeline.
3. Post-entrega, el cliente puede dejar feedback (rating + comentario).
4. El dispatcher ve métricas NPS por chofer/org en Analytics.

---

## Scope IN

### A. Página pública `/track/:token`
- React route público (sin auth).
- Edge Function `get-tracking-status` que dado `token`, devuelve:
  `plan_stop`, `driver_location` (Realtime), POD si existe, branding org.
- Componente `<PublicTrackingMap>` con Mapbox GL (token público de invitado).
- Timeline visual: planificada → en ruta → arribando (<5min) → entregada.
- Branding por org: logo, color primario, nombre comercial.
- Mobile-first responsive (>70% del tráfico esperado mobile).

### B. Edge Function `send-notification`
- Adapter pattern por canal: WhatsApp (Meta Cloud API), Email (Resend), SMS (futuro).
- Lee `org_notification_settings` para decidir qué eventos disparar.
- Idempotency-key por `(stop_id, event_type)` para no duplicar.
- Inserta en `notification_logs` con estado `pending|sent|failed|delivered|read`.
- Retry exponential: 3 intentos, backoff 1m/5m/30m.

### C. Templates WhatsApp pre-aprobados
Templates a someter a aprobación Meta:
- `delivery_scheduled` (al publicar plan)
- `delivery_in_transit` (al `route.started`)
- `delivery_arriving` (cuando ETA <15min, fired por geofence)
- `delivery_completed` (al `stop.completed`)
- `delivery_failed` (al `stop.failed`, con motivo)

Variables: `{{customer_name}}`, `{{eta}}`, `{{driver_name}}`,
`{{tracking_url}}`, `{{order_number}}`.

### D. Wizard de configuración en Settings
- UI en `NotificationSettingsPage` (componente ya iniciado).
- Toggle por canal (WhatsApp / email / SMS) por evento.
- Preview del mensaje con variables resueltas con datos demo.
- Validación de Meta Business Account / Resend API key.
- Test send a un número/email propio antes de activar.

### E. Surveys + NPS dashboard
- Edge Function `send-survey` (cron, 30 min post-`stop.completed`).
- Captura rating 1–5 + comentario en `/track/:token#feedback`.
- Persistir en `delivery_feedback`.
- Dashboard en AnalyticsPage: NPS promedio org / chofer / ruta / período.
- Filtro por motivo de feedback negativo (categorías auto-detectadas: tarde,
  trato, embalaje, dirección).

---

## Scope OUT

- Chat bidireccional en `/track/:token` (cliente ↔ chofer) → PRD 21.
- Self-scheduling (reschedule por cliente) → PRD 22 §C.
- Push notifications nativas web (Web Push API).
- Multi-idioma de templates más allá de ES/EN.

---

## Esquema técnico

### Tablas (ya existen, validar shape)
- `notification_logs(id, stop_id, channel, template, payload, status, attempts, error, created_at, sent_at, delivered_at, read_at)`
- `delivery_feedback(id, stop_id, rating, comment, categories[], created_at)`
- `org_notification_settings(org_id, channel, event, enabled, template_id, ...)`

### Edge Functions nuevas
- `supabase/functions/get-tracking-status/index.ts`
- `supabase/functions/send-notification/index.ts`
- `supabase/functions/send-survey/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts` (recibe delivery/read receipts)

### Frontend
- `src/presentation/pages/public/TrackingPublicPage.tsx`
- `src/presentation/features/notifications/` (Settings wizard)
- `src/presentation/features/analytics/components/NPSDashboard.tsx`

---

## Criterios de éxito

- Tiempo desde `route.started` hasta primera notificación WhatsApp < 5s p95.
- Tasa de entrega WhatsApp > 95% (excluyendo números bloqueados/inválidos).
- Page load p95 de `/track/:token` < 2s en 3G.
- Captura de feedback > 15% de las entregas (benchmark Beetrack 12–18%).
- 0 deals perdidos en demo por "no tienen tracking page" en 60 días.

---

## Dependencias

- Meta Business Account verificada para WhatsApp Cloud API (proceso ~5–10 días).
- Resend API key (o SendGrid) para email transaccional.
- Mapbox token público de invitado con scope solo `styles:read`.
- PRD 14 (REST API) **no es** pre-requisito — esto usa Edge Functions directas.

---

## Riesgos

- Aprobación de templates Meta puede tardar 1–2 semanas → empezar trámite YA.
- WhatsApp pricing por conversación (USD 0.005–0.08 según país); modelar costo
  en pricing del cliente.
- Tokens públicos en URL → asegurar expiración (24h post-entrega) y rate
  limiting en `get-tracking-status`.
