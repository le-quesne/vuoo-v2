import { useEffect, useState } from 'react';
import { X, MapPin, Phone, Mail, User, Star, Pencil } from 'lucide-react';
import type { Stop } from '@/data/types/database';
import { PromoteToCuratedModal } from './PromoteToCuratedModal';

// Campos extendidos introducidos en Fase A (PRD 12). Se leen de forma defensiva
// hasta que `database.ts` los incluya oficialmente.
type ExtendedStop = Stop & {
  is_curated?: boolean | null;
  use_count?: number | null;
  last_used_at?: string | null;
  required_skills?: string[] | null;
};

interface StopDetailDrawerProps {
  stop: Stop | null;
  onClose: () => void;
  onEdit?: (stop: Stop) => void;
  onPromoted?: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL');
  } catch {
    return '—';
  }
}

export function StopDetailDrawer({
  stop,
  onClose,
  onEdit,
  onPromoted,
}: StopDetailDrawerProps) {
  const [showPromote, setShowPromote] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (stop) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stop, onClose]);

  if (!stop) return null;
  const ext = stop as ExtendedStop;
  const isCurated = Boolean(ext.is_curated);

  return (
    <div
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stop-detail-title"
    >
      <div className="flex-1 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside className="w-full max-w-md bg-white shadow-xl h-full overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 id="stop-detail-title" className="text-lg font-semibold">
            Detalle del lugar
          </h2>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(stop)}
                aria-label="Editar stop"
                className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="p-6 space-y-5">
          <section>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold">{stop.name}</h3>
              {isCurated && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                  <Star size={10} /> Curado
                </span>
              )}
            </div>
            {stop.address && (
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-gray-400" />
                <span>{stop.address}</span>
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-400">Duración</div>
              <div className="font-medium mt-0.5">{stop.duration_minutes} min</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-400">Peso</div>
              <div className="font-medium mt-0.5">
                {stop.weight_kg != null ? `${stop.weight_kg} kg` : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-400">Ventana</div>
              <div className="font-medium mt-0.5">
                {stop.time_window_start && stop.time_window_end
                  ? `${stop.time_window_start} – ${stop.time_window_end}`
                  : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-400">Uso</div>
              <div className="font-medium mt-0.5">{ext.use_count ?? 0}</div>
            </div>
          </section>

          {(stop.customer_name || stop.customer_phone || stop.customer_email) && (
            <section className="space-y-1 text-sm">
              <div className="text-xs text-gray-400 mb-1">Cliente</div>
              {stop.customer_name && (
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400" />
                  {stop.customer_name}
                </div>
              )}
              {stop.customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400" />
                  <a href={`tel:${stop.customer_phone}`} className="hover:text-blue-600">
                    {stop.customer_phone}
                  </a>
                </div>
              )}
              {stop.customer_email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-400" />
                  <a href={`mailto:${stop.customer_email}`} className="hover:text-blue-600">
                    {stop.customer_email}
                  </a>
                </div>
              )}
            </section>
          )}

          {ext.required_skills && ext.required_skills.length > 0 && (
            <section>
              <div className="text-xs text-gray-400 mb-1">Skills requeridos</div>
              <div className="flex flex-wrap gap-1.5">
                {ext.required_skills.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {ext.last_used_at && (
            <div className="text-xs text-gray-400">
              Último uso: {formatDate(ext.last_used_at)}
            </div>
          )}

          <section className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowPromote(true)}
              disabled={isCurated}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Star size={14} />
              {isCurated ? 'Ya es recurrente' : 'Guardar como ubicación recurrente'}
            </button>
            {isCurated && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Este stop ya está marcado como curado.
              </p>
            )}
          </section>
        </div>
      </aside>

      {showPromote && (
        <PromoteToCuratedModal
          stop={stop}
          onClose={() => setShowPromote(false)}
          onPromoted={() => {
            setShowPromote(false);
            onPromoted?.();
          }}
        />
      )}
    </div>
  );
}
