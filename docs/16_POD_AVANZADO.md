# PRD 16 — POD Avanzado (Proof of Delivery Multi-formato)

**Pri**: P0
**Extiende**: PRD 02 — Ejecución en Terreno
**Estado**: Foto + firma + GPS geo-stamped implementado. Falta barcode,
PIN, forms custom y razón de fallo estructurada.

---

## Contexto

Track-POD, Onfleet (Scale tier), Beetrack, OptimoRoute y Routal soportan
barcode + PIN + forms custom estándar. Para **B2B** (distribución mayorista,
farma, food service, electrodomésticos, big & bulky) el POD básico actual
**descalifica** a Vuoo en RFPs.

---

## Objetivos

1. Chofer puede escanear barcode/QR del paquete para confirmar entrega.
2. Cliente recibe PIN por WhatsApp/SMS; chofer lo ingresa al entregar.
3. Dispatcher diseña formularios POD custom por tipo de cliente/entrega.
4. Razón de fallo es estructurada (no texto libre) → analytics utilizable.

---

## Scope IN

### A. Barcode / QR scanner (mobile)
- Integración `expo-barcode-scanner` (ya compatible con Expo SDK actual).
- Pantalla `PODScannerScreen` en `/mobile/app/route/[id]/stop/[stopId]/scan.tsx`.
- Validación contra `expected_sku` o `tracking_number` del stop.
- Soporte: EAN-13, EAN-8, Code 128, QR.
- Modo bulk: chofer escanea N códigos para entrega de varias unidades.
- Si mismatch → modal "¿Marcar como entregado igual?" con justificación.

### B. PIN de entrega
- Generado al crear orden (4–6 dígitos numéricos, configurable por org).
- Enviado al cliente en notificación `delivery_in_transit` (PRD 13).
- Validación: 3 intentos, después fallback a foto + firma + flag manual.
- Almacenado hasheado (bcrypt) en `stops.delivery_pin_hash`.

### C. Forms POD custom (builder)
- UI builder en `/settings/pod-templates`:
  - Tipos de campo: text, textarea, number, select, multi-select, checkbox,
    photo, signature, rating.
  - Reglas: required/optional, condicional (mostrar si X).
  - Vista previa mobile.
- Asignación de template por:
  - Tipo de cliente (`customer.tags`).
  - Tipo de entrega (`stop.service_type`: delivery, pickup, install).
  - Tipo de vehículo (refrigerado, hazmat).
- Persistir respuestas en `pod_form_responses(stop_id, template_id, answers jsonb)`.

### D. Razón de fallo estructurada
- Categorías hardcoded v1: `customer_absent`, `wrong_address`, `refused`,
  `damaged_package`, `access_denied`, `vehicle_breakdown`, `weather`, `other`.
- Sub-razones configurables por org.
- Modal en mobile (`IncidentReportModal` ya existe → extender).
- Foto opcional para algunos motivos (`damaged_package`, `access_denied`).
- Reintento programable: `customer_absent` puede programar segundo intento;
  `refused` no.

### E. Templates POD por industria (presets)
- Food service: foto + temperatura del paquete + firma.
- Farma: PIN + foto blister + receta médica si controlado.
- Big & bulky: foto pre-instalación + post-instalación + firma + checklist
  daños.
- E-commerce estándar: foto + firma (default actual).

### F. POD verification dashboard
- Vista en `/control` con filtro "POD incompletos / sospechosos".
- Reglas auto: foto borrosa (blur score), GPS lejos de la dirección > 100m,
  PIN ingresado manualmente (no por SMS).
- Permite re-solicitar POD al chofer si está aún en ruta.

---

## Scope OUT

- Reconocimiento de identidad facial (compliance regulatory pesado).
- OCR de cédula/DNI (futuro, requisito en farma controlada).
- Integración con dispositivos PDA físicos (Zebra, Honeywell) — fase 2.

---

## Esquema técnico

### Tablas nuevas
```sql
create table pod_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  fields jsonb not null, -- definición declarativa
  enabled boolean default true,
  created_at timestamptz default now()
);

create table pod_form_responses (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references stops(id),
  template_id uuid references pod_templates(id),
  answers jsonb not null,
  created_at timestamptz default now()
);

create table delivery_failure_reasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id), -- null = global
  category text not null,
  label text not null,
  requires_photo boolean default false,
  allows_retry boolean default true
);

alter table stops add column delivery_pin_hash text;
alter table stops add column expected_sku text;
alter table stops add column pod_template_id uuid references pod_templates(id);
```

### Mobile
- `mobile/src/screens/pod/`: scanner, pin entry, dynamic form renderer.
- `mobile/src/components/PODFormRenderer.tsx` que renderiza dinámicamente
  por `template.fields`.

### Frontend admin
- `src/presentation/features/pod-templates/` con builder drag-drop.

---

## Criterios de éxito

- 100% de stops B2B usan al menos un POD avanzado (PIN o barcode) en 60 días.
- Tasa de POD "sospechoso" < 5% en piloto.
- 3+ templates custom creados por cliente piloto.
- 0 demos perdidas por "POD básico" en 60 días.

---

## Dependencias

- PRD 13 para envío del PIN al cliente.
- Permission camera ya activo en mobile.

---

## Riesgos

- Builder de forms puede over-engineer; v1 mínimo: text + select + photo +
  signature + rating. Más tipos en función de demanda real.
- PIN puede confundir al cliente final → UX clara en notificación.
