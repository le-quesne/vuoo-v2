import { X } from 'lucide-react';
import type { PreviewRow } from '../../types/import.types';

interface MatchReviewModalProps {
  row: PreviewRow;
  onClose: () => void;
  onReuseStop: () => void;
  onCreateNew: () => void;
}

export function MatchReviewModal({ row, onClose, onReuseStop, onCreateNew }: MatchReviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Revisar match de ubicación"
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Revisar match de ubicación</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-0 border-b border-gray-100">
          <div className="p-5 border-r border-gray-100">
            <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Del CSV</div>
            <div className="space-y-1.5 text-sm">
              <div>
                <span className="text-gray-500">Cliente: </span>
                <span className="text-gray-900">{row.values.customer_name || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Dirección: </span>
                <span className="text-gray-900">{row.values.address || '—'}</span>
              </div>
              {row.values.customer_phone && (
                <div>
                  <span className="text-gray-500">Teléfono: </span>
                  <span className="text-gray-900">{row.values.customer_phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Stop existente</div>
            {row.matchCandidate ? (
              <div className="space-y-1.5 text-sm">
                <div>
                  <span className="text-gray-500">Cliente: </span>
                  <span className="text-gray-900">{row.matchCandidate.customerName || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Dirección: </span>
                  <span className="text-gray-900">{row.matchCandidate.address}</span>
                </div>
                <div>
                  <span className="text-gray-500">Veces usada: </span>
                  <span className="text-gray-900">{row.matchCandidate.useCount}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">Sin candidato disponible</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={onCreateNew}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Crear ubicación nueva
          </button>
          <button
            onClick={onReuseStop}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Usar este stop
          </button>
        </div>
      </div>
    </div>
  );
}
