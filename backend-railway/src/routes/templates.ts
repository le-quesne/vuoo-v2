import { Hono } from 'hono';
// xlsx-populate no tiene tipos oficiales; cast a any para usar la API.
// @ts-expect-error xlsx-populate sin types oficiales
import XlsxPopulateRaw from 'xlsx-populate';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XlsxPopulate: any = XlsxPopulateRaw;

export const templatesRoutes = new Hono();

const CANONICAL_COLUMNS = [
  'customer_name',
  'customer_phone',
  'customer_email',
  'address',
  'total_weight_kg',
  'volume_m3',
  'time_window_start',
  'time_window_end',
  'requested_date',
  'priority',
  'service_duration_minutes',
  'internal_notes',
  'order_number',
] as const;

const SAMPLE_ROW = [
  'Juan Pérez',
  '+56912345678',
  'juan@example.cl',
  'Av. Providencia 1234, Santiago',
  '3.5',
  '0.05',
  '09:00',
  '12:00',
  '2026-04-20',
  'normal',
  '10',
  'Frágil',
  'ORD-001',
];

const COLUMN_NOTES: Record<string, string> = {
  customer_name: 'Obligatorio. Nombre del cliente que recibe.',
  address: 'Obligatorio. Dirección completa.',
  total_weight_kg: 'Decimal. Soporta "5,5" o "5.5". Unidades como "kg" se ignoran.',
  volume_m3: 'Decimal. Metros cúbicos.',
  time_window_start: 'Hora 24h, formato HH:MM.',
  time_window_end: 'Hora 24h, formato HH:MM.',
  requested_date: 'Fecha YYYY-MM-DD.',
  priority: 'Uno de: urgent | high | normal | low | urgente | alta | baja.',
  order_number: 'Único por organización. Si se omite, lo generamos.',
};

/**
 * GET /templates/orders.xlsx
 *
 * Genera y devuelve un .xlsx con headers canónicos + 1 fila de ejemplo +
 * comentarios por columna explicando formato. No requiere auth — el archivo
 * es plantilla pública sin datos del cliente.
 */
templatesRoutes.get('/orders.xlsx', async () => {
  const wb = await XlsxPopulate.fromBlankAsync();
  const sheet = wb.sheet(0).name('Pedidos');

  // Headers (fila 1) en bold
  CANONICAL_COLUMNS.forEach((col, idx) => {
    const cell = sheet.cell(1, idx + 1);
    cell.value(col);
    cell.style({ bold: true, fontColor: 'FFFFFF', fill: '2563EB' });
  });

  // Notas por columna en una hoja separada (xlsx-populate runtime no expone
  // .comment() en celdas). Sirve como referencia para el dispatcher.
  const notesSheet = wb.addSheet('Notas');
  notesSheet.cell(1, 1).value('Columna').style({ bold: true });
  notesSheet.cell(1, 2).value('Formato esperado').style({ bold: true });
  let notesRow = 2;
  for (const col of CANONICAL_COLUMNS) {
    const note = COLUMN_NOTES[col];
    if (!note) continue;
    notesSheet.cell(notesRow, 1).value(col);
    notesSheet.cell(notesRow, 2).value(note);
    notesRow++;
  }
  notesSheet.column(1).width(28);
  notesSheet.column(2).width(80);

  // Fila de ejemplo (fila 2)
  SAMPLE_ROW.forEach((val, idx) => {
    sheet.cell(2, idx + 1).value(val);
  });

  // Auto-fit aproximado
  CANONICAL_COLUMNS.forEach((col, idx) => {
    sheet.column(idx + 1).width(Math.max(col.length + 2, 16));
  });

  // Freeze header row
  sheet.freezePanes(0, 1);

  const buffer = (await wb.outputAsync()) as Buffer;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_pedidos_vuoo.xlsx"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

/**
 * GET /templates/orders.csv
 * Variante CSV con BOM UTF-8 para que Excel español la abra sin caracteres raros.
 */
templatesRoutes.get('/orders.csv', () => {
  const header = CANONICAL_COLUMNS.join(',');
  const example = SAMPLE_ROW.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',');
  // BOM + content
  const body = '﻿' + header + '\n' + example + '\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla_pedidos_vuoo.csv"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
