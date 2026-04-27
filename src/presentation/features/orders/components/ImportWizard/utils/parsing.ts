/**
 * Parsing CSV/XLSX para el ImportWizard.
 *
 * - CSV: PapaParse maneja BOM, separador `;`/`,`/`\t`, line breaks dentro de
 *   quoted strings, y encodings que el browser ya decodifica vía File.text().
 * - XLSX: read-excel-file. Si el archivo > FILE_SIZE_WORKER_BYTES, parseamos
 *   en Web Worker para no congelar el main thread.
 *
 * Defensa contra archivos maliciosos:
 * - file.size validado contra MAX_FILE_SIZE_BYTES en el caller (Step1).
 * - Cap de columnas (MAX_COLUMNS) acá: rechaza CSVs explosivos.
 *
 * NOTA: Latin-1 / Windows-1252 — la web platform decodifica como UTF-8 por
 * defecto al leer File.text(). Si el archivo viene en Latin-1 con BOM, el
 * primer header llega corrupto. Para detectar esto, intentamos primero
 * UTF-8 y si la primera línea contiene caracteres reemplazo (�),
 * re-decodificamos como Windows-1252.
 */
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import { MAX_COLUMNS, FILE_SIZE_WORKER_BYTES } from '../constants';

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  /** Avisos no fatales que la UI puede mostrar al usuario. */
  warnings: string[];
}

/**
 * Normaliza una celda a string. Maneja Date (read-excel-file devuelve Date JS
 * para columnas con formato fecha), number, boolean, null y string.
 *
 * Para Date: ISO sin hora (YYYY-MM-DD) si la hora es medianoche UTC, o ISO
 * completo (YYYY-MM-DDTHH:mm:ssZ) si trae hora. Esto evita el bug de
 * `String(date)` que produce "Mon Apr 21 2026 00:00:00 GMT-0400" — que
 * Postgres no parsea.
 */
export function cellToString(val: unknown): string {
  if (val == null) return '';
  if (val instanceof Date) {
    // Si es medianoche UTC asumimos que es solo fecha, sin hora.
    const ms = val.getTime();
    if (Number.isNaN(ms)) return '';
    if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0) {
      return val.toISOString().slice(0, 10);
    }
    return val.toISOString();
  }
  return String(val).trim();
}

/**
 * Detecta la fila de header dentro de las primeras 5 filas.
 *
 * Heurística (conservadora): la fila de header es la PRIMERA con ≥2 celdas
 * no vacías. Filas anteriores se asumen títulos/banners y se ignoran.
 *
 * Esto evita confundir header con data cuando el header legítimamente tiene
 * algunas celdas vacías y la primera fila de datos tiene todas llenas.
 */
function detectHeaderRowIndex(rows: unknown[][], scanLimit = 5): number {
  if (rows.length === 0) return 0;
  const limit = Math.min(scanLimit, rows.length);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const nonEmpty = row.filter((c) => c != null && String(c).trim().length > 0).length;
    if (nonEmpty >= 2) return i;
  }
  return 0;
}

/**
 * Quita columnas trailing donde NI el header NI ningún valor de las filas
 * tienen contenido. Devuelve los índices que sobreviven.
 */
function activeColumnIndexes(headerCells: unknown[], dataRows: unknown[][]): number[] {
  const colCount = Math.max(
    headerCells.length,
    ...dataRows.map((r) => (Array.isArray(r) ? r.length : 0)),
    0,
  );
  const active: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const headerVal = headerCells[c];
    const headerHas = headerVal != null && String(headerVal).trim().length > 0;
    let dataHas = false;
    if (!headerHas) {
      for (const r of dataRows) {
        if (!Array.isArray(r)) continue;
        const v = r[c];
        if (v != null && String(v).trim().length > 0) {
          dataHas = true;
          break;
        }
      }
    }
    if (headerHas || dataHas) active.push(c);
  }
  return active;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Decodifica el archivo como texto manejando UTF-8 con/sin BOM y haciendo
 * fallback a Windows-1252 si UTF-8 produce caracteres reemplazo.
 */
async function readAsTextWithEncodingFallback(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8 = utf8Decoder.decode(buffer);
  if (!utf8.includes('�')) {
    return utf8;
  }
  try {
    const win1252 = new TextDecoder('windows-1252', { fatal: false });
    return win1252.decode(buffer);
  } catch {
    return utf8;
  }
}

export async function parseCsv(file: File): Promise<ParseResult> {
  const text = await readAsTextWithEncodingFallback(file);
  const warnings: string[] = [];

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimiter: '',
    header: false,
    transform: (value: string) => value.trim(),
  });

  const data = result.data;
  if (data.length === 0) {
    return { headers: [], rows: [], warnings };
  }

  if (result.errors.length > 0) {
    const fatal = result.errors.find((e) => e.type === 'Quotes');
    if (fatal) {
      throw new ParseError(`Error de formato CSV: ${fatal.message}`);
    }
    warnings.push(`${result.errors.length} aviso(s) menor(es) en el CSV`);
  }

  return finalizeRows(data, warnings);
}

/**
 * Normaliza la salida de `read-excel-file`. La lib devuelve dos shapes posibles:
 *  - Plano: Cell[][]  (caso típico de archivos simples)
 *  - Wrapper: { sheet: string, data: Cell[][] }[]  (cuando el workbook tiene
 *    metadata de hoja, p.ej. exports de ERPs como Datasul)
 *
 * Devolvemos siempre Cell[][] del primer sheet (el que el usuario ve por defecto).
 */
function unwrapSheet(raw: unknown): { matrix: unknown[][]; sheetName?: string; sheetCount: number } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { matrix: [], sheetCount: 0 };
  }
  const first = raw[0];
  // Wrapper format: [{ sheet, data }]
  if (first && typeof first === 'object' && !Array.isArray(first) && 'data' in first) {
    const wrapped = raw as Array<{ sheet?: string; data?: unknown[][] }>;
    const target = wrapped[0];
    return {
      matrix: Array.isArray(target.data) ? target.data : [],
      sheetName: target.sheet,
      sheetCount: wrapped.length,
    };
  }
  // Flat format: Cell[][]
  return { matrix: raw as unknown[][], sheetCount: 1 };
}

export async function parseXlsx(file: File): Promise<ParseResult> {
  const warnings: string[] = [];
  const raw = await readSheet(file);
  const { matrix, sheetName, sheetCount } = unwrapSheet(raw);

  if (sheetCount > 1 && sheetName) {
    warnings.push(
      `El archivo tiene ${sheetCount} pestañas; importamos sólo "${sheetName}".`,
    );
  }

  if (matrix.length === 0) {
    return { headers: [], rows: [], warnings };
  }

  return finalizeRows(matrix, warnings);
}

/**
 * Toma una matriz cruda (filas × columnas) sin asumir cuál es la fila de header
 * ni cuál es el ancho real, y devuelve un ParseResult limpio:
 *  - detecta la fila de header en las primeras 5 filas (la que tiene más cells)
 *  - dropea columnas trailing donde header y todas las celdas son vacías
 *  - dedupea headers con sufijo "(2)", "(3)"
 */
function finalizeRows(matrix: unknown[][], warnings: string[]): ParseResult {
  if (matrix.length === 0) return { headers: [], rows: [], warnings };

  const headerIdx = detectHeaderRowIndex(matrix);
  if (headerIdx > 0) {
    warnings.push(
      `Headers detectados en la fila ${headerIdx + 1}; las primeras ${headerIdx} fila(s) se ignoran.`,
    );
  }

  const headerRow = matrix[headerIdx] ?? [];
  if (!Array.isArray(headerRow)) {
    throw new ParseError('Formato no reconocido');
  }

  const dataMatrix = matrix.slice(headerIdx + 1).filter((r): r is unknown[] => Array.isArray(r));
  const active = activeColumnIndexes(headerRow, dataMatrix);

  if (active.length === 0) {
    return { headers: [], rows: [], warnings };
  }
  if (active.length > MAX_COLUMNS) {
    throw new ParseError(
      `El archivo tiene ${active.length} columnas; máximo permitido ${MAX_COLUMNS}.`,
    );
  }

  const rawHeaders = active.map((idx) => cellToString(headerRow[idx]));

  const { headers, dupeWarning } = dedupeHeaders(rawHeaders);
  if (dupeWarning) warnings.push(dupeWarning);

  const rows = dataMatrix.map((row) => {
    const out: Record<string, string> = {};
    active.forEach((srcIdx, dstIdx) => {
      out[headers[dstIdx]] = cellToString(row[srcIdx]);
    });
    return out;
  });

  // Filas completamente vacías (todas las celdas activas en blanco) las dropeamos.
  const filtered = rows.filter((r) => Object.values(r).some((v) => v.length > 0));

  return { headers, rows: filtered, warnings };
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

/**
 * Si dos columnas comparten header (ej. "Direccion" en col A y col J), el
 * último gana en el lookup de Record. Acá:
 *  - renombramos los duplicados como "Direccion (2)", "Direccion (3)"
 *  - emitimos un warning para que la UI lo muestre.
 */
function dedupeHeaders(rawHeaders: string[]): { headers: string[]; dupeWarning?: string } {
  const seen = new Map<string, number>();
  const headers: string[] = [];
  const dupes: string[] = [];

  rawHeaders.forEach((h, idx) => {
    const base = h || `Columna ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    if (count === 0) {
      seen.set(base, 1);
      headers.push(base);
    } else {
      seen.set(base, count + 1);
      headers.push(`${base} (${count + 1})`);
      if (!dupes.includes(base)) dupes.push(base);
    }
  });

  if (dupes.length > 0) {
    return {
      headers,
      dupeWarning: `Headers duplicados renombrados: ${dupes.join(', ')}.`,
    };
  }
  return { headers };
}

/** Helper exportado para que Step 1 decida si activar el Worker o no. */
export function shouldUseWorker(file: File): boolean {
  return file.size > FILE_SIZE_WORKER_BYTES;
}
