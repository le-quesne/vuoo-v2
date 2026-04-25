import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Download, AlertCircle } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { parseCsv } from '@/presentation/features/orders/utils/csv';
import { CANONICAL_COLUMNS, CANONICAL_LABELS } from '../types/import.types';
import type { WizardState } from '../types/import.types';

interface Step1FileDropProps {
  state: WizardState;
  onFileLoaded: (args: {
    file: File;
    fileName: string;
    headers: string[];
    rawRows: Record<string, string>[];
  }) => void;
}

async function parseXlsx(file: File): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const sheet = await readSheet(file);
  if (sheet.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...dataRows] = sheet;
  const headers = headerRow.map((h) => (h == null ? '' : String(h).trim()));
  if (headers.length === 0) return { headers: [], rows: [] };
  const rows = dataRows.map((row) => {
    const out: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const val = row[idx];
      out[h] = val == null ? '' : String(val).trim();
    });
    return out;
  });
  return { headers, rows };
}

async function parseFile(file: File): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'xlsx') {
    return parseXlsx(file);
  }
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  // parseCsv ya lowercasea los headers, reconstruimos preservando esos keys.
  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

function buildSampleCsv(): string {
  const header = CANONICAL_COLUMNS.join(',');
  const example = [
    'Juan Pérez',
    '+56912345678',
    'juan@example.cl',
    'Av. Providencia 1234 Santiago',
    '3.5',
    '0.05',
    '09:00',
    '12:00',
    '2026-04-20',
    'normal',
    '10',
    'Fragil',
    'ORD-001',
  ].join(',');
  return `${header}\n${example}\n`;
}

function downloadSample() {
  const csv = buildSampleCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_pedidos_vuoo.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function Step1FileDrop({ state, onFileLoaded }: Step1FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setIsParsing(true);
      try {
        const { headers, rows } = await parseFile(file);
        if (headers.length === 0 || rows.length === 0) {
          setParseError('El archivo está vacío o no tiene filas de datos.');
          return;
        }
        onFileLoaded({ file, fileName: file.name, headers, rawRows: rows });
      } catch (e) {
        setParseError(
          e instanceof Error ? e.message : 'No se pudo leer el archivo',
        );
      } finally {
        setIsParsing(false);
      }
    },
    [onFileLoaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Seleccioná un archivo
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Soportamos CSV y Excel (.xlsx). Arrastralo acá o buscalo en tu equipo.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'relative rounded-xl border-2 border-dashed py-12 px-6 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/30',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Upload size={28} className="mx-auto text-gray-400 mb-2" />
        <div className="text-sm font-medium text-gray-700">
          {isParsing ? 'Leyendo archivo…' : 'Soltá el archivo o hacé clic para buscarlo'}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          CSV, XLSX — hasta ~10 MB
        </div>
      </div>

      {state.file && !isParsing && !parseError && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <FileText size={16} className="text-emerald-600" />
          <div className="flex-1">
            <div className="font-medium text-emerald-900">{state.fileName}</div>
            <div className="text-xs text-emerald-700">
              {state.rawRows.length} fila{state.rawRows.length === 1 ? '' : 's'} detectadas — {state.headers.length} columnas
            </div>
          </div>
        </div>
      )}

      {parseError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-gray-900">
              ¿Primera vez importando?
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Descargá la plantilla con todas las columnas canónicas de Vuoo.
            </p>
          </div>
          <button
            onClick={downloadSample}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={14} />
            Descargar plantilla
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <div className="font-medium text-gray-700 mb-1">
            Columnas canónicas
          </div>
          <div className="flex flex-wrap gap-1">
            {CANONICAL_COLUMNS.map((c) => (
              <code
                key={c}
                className="inline-block rounded bg-white border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                title={CANONICAL_LABELS[c]}
              >
                {c}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
