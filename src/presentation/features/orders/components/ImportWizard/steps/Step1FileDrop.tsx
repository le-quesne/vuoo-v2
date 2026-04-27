import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Download, AlertCircle, AlertTriangle } from 'lucide-react';
import { CANONICAL_COLUMNS, CANONICAL_LABELS } from '../types/import.types';
import type { WizardState } from '../types/import.types';
import { parseFile, ParseError } from '../utils/parsing';
import {
  MAX_FILE_SIZE_BYTES,
  FILE_SIZE_WARNING_BYTES,
} from '../constants';

interface Step1FileDropProps {
  state: WizardState;
  onFileLoaded: (args: {
    file: File;
    fileName: string;
    headers: string[];
    rawRows: Record<string, string>[];
    warnings: string[];
  }) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function downloadCsvTemplate() {
  const csv = buildSampleCsv();
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_pedidos_vuoo.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function downloadXlsxTemplate(): Promise<{ ok: boolean; error?: string }> {
  if (!ROUTING_BASE) {
    return { ok: false, error: 'VITE_ROUTING_BASE_URL no configurada' };
  }
  try {
    const res = await fetch(`${ROUTING_BASE}/templates/orders.xlsx`);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_pedidos_vuoo.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}

export function Step1FileDrop({ state, onFileLoaded }: Step1FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [xlsxDlError, setXlsxDlError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setParseWarnings([]);

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setParseError(
          `El archivo pesa ${formatBytes(file.size)}; máximo permitido ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
        );
        return;
      }

      setIsParsing(true);
      try {
        const result = await parseFile(file);
        if (result.headers.length === 0 || result.rows.length === 0) {
          setParseError('El archivo está vacío o no tiene filas de datos.');
          return;
        }
        onFileLoaded({
          file,
          fileName: file.name,
          headers: result.headers,
          rawRows: result.rows,
          warnings: result.warnings,
        });
        setParseWarnings(result.warnings);
      } catch (e) {
        if (e instanceof ParseError) {
          setParseError(e.message);
        } else {
          setParseError(e instanceof Error ? e.message : 'No se pudo leer el archivo');
        }
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
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;
      if (files.length > 1) {
        setParseError('Soltá un solo archivo a la vez.');
        return;
      }
      void handleFile(files[0]);
    },
    [handleFile],
  );

  const isLargeFile = state.file && state.file.size > FILE_SIZE_WARNING_BYTES;

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
          CSV, XLSX — hasta {formatBytes(MAX_FILE_SIZE_BYTES)}
        </div>
      </div>

      {state.file && !isParsing && !parseError && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <FileText size={16} className="text-emerald-600" />
          <div className="flex-1">
            <div className="font-medium text-emerald-900">{state.fileName}</div>
            <div className="text-xs text-emerald-700">
              {state.rawRows.length} fila{state.rawRows.length === 1 ? '' : 's'} detectadas — {state.headers.length} columnas — {formatBytes(state.file.size)}
            </div>
          </div>
        </div>
      )}

      {isLargeFile && !parseError && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Archivo grande ({formatBytes(state.file!.size)}). El procesamiento puede tardar varios segundos.
          </span>
        </div>
      )}

      {parseWarnings.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <ul className="space-y-0.5 list-disc list-inside">
            {parseWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {parseError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {xlsxDlError && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>No pudimos descargar la plantilla XLSX: {xlsxDlError}. Probá con la CSV.</span>
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
          <div className="flex gap-2 shrink-0">
            <button
              onClick={async () => {
                setXlsxDlError(null);
                const r = await downloadXlsxTemplate();
                if (!r.ok) setXlsxDlError(r.error ?? 'Error');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download size={14} />
              XLSX
            </button>
            <button
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download size={14} />
              CSV
            </button>
          </div>
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
