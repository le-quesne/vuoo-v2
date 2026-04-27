import { X } from 'lucide-react';
import type { PreviewRow } from '../../types/import.types';

interface RawRowModalProps {
  row: PreviewRow;
  onClose: () => void;
}

/**
 * Modal "ver fila original" — muestra rawRow (los valores tal como vienen del CSV).
 * Útil para que el dispatcher debugee filas con error sin volver al Excel.
 */
export function RawRowModal({ row, onClose }: RawRowModalProps) {
  const entries = Object.entries(row.raw);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Fila original del archivo"
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Fila original del archivo</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tal cual vino en el CSV/XLSX, antes del mapeo y de la limpieza.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {entries.length === 0 ? (
            <div className="text-sm text-gray-400 italic">Sin datos disponibles.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {entries.map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 pr-3 text-gray-500 font-medium align-top">{k}</td>
                    <td className="py-1.5 text-gray-900 break-words font-mono text-xs">
                      {v || <span className="text-gray-400 italic">vacío</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {row.warnings.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-medium text-amber-800 mb-1">Avisos de la fila</div>
              <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
                {row.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {row.error && (
            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-red-700">
              <span className="font-medium">Error: </span>
              {row.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
