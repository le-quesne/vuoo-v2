import { useRef, useState } from 'react';
import { X, Upload, FileText } from 'lucide-react';
import { customersService } from '@/data/services/customers';
import type { ImportReport } from '../types/customer.types';

interface CustomerImportModalProps {
  onClose: () => void;
  onImported: (report: ImportReport) => void;
}

export function CustomerImportModal({ onClose, onImported }: CustomerImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setIsPending(true);
    const res = await customersService.importFromCsv(file);
    setIsPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setReport(res.data);
    onImported(res.data);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-import-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="customer-import-title" className="text-lg font-semibold">
            Importar clientes (CSV)
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Columnas esperadas: <code>code, name, email, phone, address, skills</code>.
          Skills separadas por <code>|</code>.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Seleccionar archivo CSV"
          className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
              <FileText size={16} className="text-blue-500" />
              <span className="truncate max-w-[260px]">{file.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-sm text-gray-400">
              <Upload size={20} />
              <span>Haz click para seleccionar un archivo CSV</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setReport(null);
              setError(null);
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
          >
            {error}
          </div>
        )}

        {report && (
          <div className="mt-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
            Importados: <strong>{report.created ?? 0}</strong>. Fallidos:{' '}
            <strong>{report.failed ?? 0}</strong>.
            {report.warnings && report.warnings.length > 0 && (
              <ul className="list-disc pl-4 mt-1">
                {report.warnings.slice(0, 3).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {report ? 'Cerrar' : 'Cancelar'}
          </button>
          {!report && (
            <button
              type="submit"
              disabled={!file || isPending}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? 'Importando…' : 'Importar'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
