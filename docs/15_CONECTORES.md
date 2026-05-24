# PRD 15 — Conectores E-commerce y ERP

**Pri**: P0 (e-commerce) / P1 (ERP)
**Depende de**: [[PRD 14]] (REST + Webhooks)
**Estado**: Solo Datasul (Renner) implementado como custom. Ningún
conector productizado.

---

## Contexto

Beetrack, SimpliRoute, Routal y Drivin tienen al menos un conector
e-commerce nativo (VTEX y/o Shopify). En LATAM retail, **VTEX no es
opcional**: Falabella, Cencosud, Ripley, Sodimac, Paris, Tottus, Walmart
Chile lo usan. Drivin además usa **SAP B1 (certificación SAP Store)** como
wedge enterprise.

---

## Objetivos

1. Cliente VTEX puede conectar Vuoo en < 30 minutos sin código.
2. Cliente Shopify puede instalar la app desde Shopify App Store.
3. Orden creada en e-commerce → aparece en Vuoo geocodificada y lista para
   ruteo.
4. Stop completado en Vuoo → orden marcada como entregada en e-commerce.
5. ERP mid-market (SAP B1, NetSuite) tiene conector documentado.

---

## Scope IN

### A. Conector VTEX
- App pública en VTEX IO marketplace.
- OAuth flow contra Vuoo (token API generado para la org).
- Sync inicial bidireccional:
  - Orders VTEX en estado `ready-for-handling` → POST `/v1/orders`.
  - Stop `completed` en Vuoo → cambia order VTEX a `invoiced` o `delivered`.
- Webhook VTEX → Vuoo: nuevas órdenes, cancelaciones.
- UI de mapping de campos (SLA VTEX → time-window Vuoo).
- Soporte multi-warehouse / sellerId.

### B. Conector Shopify
- App pública en Shopify App Store.
- Embedded admin app (Polaris + App Bridge).
- Auth via Shopify OAuth.
- Webhook `orders/create` → POST `/v1/orders`.
- Update `fulfillment` cuando stop completa.
- Mapeo de tags Shopify → labels Vuoo.

### C. Conector Tiendanube
- Misma estructura que Shopify, App Store de Tiendanube.
- Importante en mercado argentino y mexicano.

### D. Conector SAP Business One
- Add-on SAP B1 (B1iF flows o Service Layer REST).
- Documentación de configuración paso a paso.
- Certificación SAP Store (proceso ~3 meses).
- Mapeo objetos: Sales Order → Plan; Delivery → Route; Item → Stop.

### E. Conector Oracle NetSuite
- SuiteApp publicada en NetSuite SuiteApp Marketplace (o RESTlet inicial).
- Mapeo: Sales Order → Plan, Fulfillment → completed stop.

### F. Conector Microsoft Dynamics 365
- Power Platform connector + REST.
- Importante en mid-market industrial.

### G. Generalización de Datasul → Connector Framework
- Refactor del conector Renner para que sea un caso especial del framework.
- Base abstracta: `BaseConnector` con métodos `fetchOrders`, `pushStatus`,
  `mapFields`, `validateConfig`.

---

## Scope OUT

- Conectores genéricos low-code tipo Zapier/Make → fuera, eso lo cubre PRD 14
  via REST + Webhooks.
- Magento, BigCommerce, WooCommerce → segunda ola post-validación VTEX + Shopify.
- Manhattan, Oracle WMS, Korber → enterprise, fuera de roadmap 12 meses.

---

## Esquema técnico

### Tablas nuevas
```sql
create table org_connectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  type text not null check (type in ('vtex','shopify','tiendanube','sap_b1','netsuite','dynamics','datasul')),
  config jsonb not null, -- credenciales encriptadas, mapeo, etc
  enabled boolean default true,
  last_sync_at timestamptz,
  last_sync_status text,
  created_at timestamptz default now()
);

create table connector_sync_logs (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid references org_connectors(id),
  direction text check (direction in ('inbound','outbound')),
  entity text, -- 'order', 'fulfillment', etc
  external_id text,
  internal_id uuid,
  status text,
  error text,
  payload jsonb,
  created_at timestamptz default now()
);
```

### Backend
- `backend-railway/src/connectors/base.connector.ts` (interfaz común).
- `backend-railway/src/connectors/vtex/`, `shopify/`, `tiendanube/`, etc.
- Worker dedicado para syncs: `connector-sync-worker.ts`.

### Frontend
- `src/presentation/features/connectors/` con catálogo + UI de config.
- `/settings/connectors` con tarjetas por conector disponible.

---

## Criterios de éxito

- 1er cliente conectado a VTEX en producción en 60 días.
- 1er cliente conectado a Shopify en 90 días.
- Tiempo medio de setup VTEX < 30 minutos.
- < 1% de errores de sync inbound (orden creada en e-com pero no en Vuoo).
- Certificación SAP Store iniciada en 90 días (timeline real ~3 meses).

---

## Dependencias

- **PRD 14** debe estar al menos en beta antes de empezar VTEX.
- Cuenta partner VTEX (gratis, registro online).
- Shopify Partners account.
- Tiendanube Partner program.

---

## Riesgos

- Cada conector requiere mantenimiento perpetuo (cambios de API del partner).
  Asignar owner técnico por conector.
- VTEX SLA-aware ordering: las órdenes vienen con ventanas de entrega que
  hay que respetar — coordinar con PRD 19 (time-windows duras en Vroom).
- Shopify rate limits agresivos (2 req/s default) — usar bulk operations API
  para sync inicial.
