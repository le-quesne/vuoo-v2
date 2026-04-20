import { useState } from 'react';
import { X, Star, GitMerge } from 'lucide-react';
import { stopsService } from '@/data/services/stops';
import type { Stop } from '@/data/types/database';

// Campos extendidos añadidos en Fase A (PRD 12). Como `database.ts` aún no los
// incluye hasta que el servicio los regenere, los leemos de forma defensiva.
type ExtendedStop = Stop & {
  is_curated?: boolean | null;
  use_count?: number | null;
  last_used_at?: string | null;
  required_skills?: string[] | null;
  customer_id?: string | null;
};

interface MergeStopsModalProps {
  stopA: Stop;
  stopB: Stop;
  score: number;
  onClose: () => void;
  onMerged: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

function pickDefaultWinner(a: ExtendedStop, b: ExtendedStop): 'a' | 'b' {
  if (a.is_curated && !b.is_curated) return 'a';
  if (b.is_curated && !a.is_curated) return 'b';
  const aUse = a.use_count ?? 0;
  const bUse = b.use_count ?? 0;
  if (bUse > aUse) return 'b';
  return 'a';
}

export function MergeStopsModal({ stopA, stopB, score, onClose, onMerged }: MergeStopsModalProps) {
  const a = stopA as ExtendedStop;
  const b = stopB as ExtendedStop;
  const [winnerKey, setWinnerKey] = useState<'a' | 'b'>(pickDefaultWinner(a, b));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winner = winnerKey === 'a' ? a : b;
  const loser = winnerKey === 'a' ? b : a;

  async function handleConfirm() {
    setError(null);
    setIsPending(true);
    const res = await stopsService.mergeStops(loser.id, winner.id);
    setIsPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    window.alert(`Stops fusionados. "${loser.name}" se absorbió en "${winner.name}".`);
    onMerged();
  }

  function renderColumn(stop: ExtendedStop, key: 'a' | 'b', label: string) {
    const selected = winnerKey === key;
    return (
      <button
        type="button"
        onClick={() => setWinnerKey(key)}
        aria-pressed={selected}
        aria-label={`Elegir ${label} como stop ganador`}
        className={`text-left p-4 rounded-lg border transition-colors min-w-0 ${
          selected
            ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-200'
            : 'border-gray-200 hover:border-gray-300 bg-white'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400 uppercase">{label}</span>
          {selected && (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <Star size={12} /> Ganador
            </span>
          )}
        </div>
        <div className="text-sm font-semibold truncate">{stop.name}</div>
        <div className="text-xs text-gray-500 truncate mb-2">
          {stop.address ?? 'Sin dirección'}
        </div>
        <dl className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-400">Cliente</dt>
            <dd className="truncate max-w-[60%] text-right">
              {stop.customer_name ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-400">Uso</dt>
            <dd>{stop.use_count ?? 0}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-400">Último uso</dt>
            <dd>{formatDate(stop.last_used_at)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-400">Curado</dt>
            <dd>{stop.is_curated ? 'Sí' : 'No'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-400">Skills</dt>
            <dd className="text-right max-w-[60%] truncate">
              {stop.required_skills && stop.required_skills.length > 0
                ? stop.required_skills.join(', ')
                : '—'}
            </dd>
          </div>
        </dl>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-stops-title"
    >
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 id="merge-stops-title" className="text-lg font-semibold">
              Fusionar stops
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Similitud: {(score * 100).toFixed(0)}%. Elige cuál ubicación se queda. Las
              órdenes del perdedor se re-apuntan al ganador.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {renderColumn(a, 'a', 'Stop A')}
          {renderColumn(b, 'b', 'Stop B')}
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
          Ganador: <strong>{winner.name}</strong>. Se eliminará{' '}
          <strong>{loser.name}</strong>. Las órdenes y <code>plan_stops</code>{' '}
          asociadas al perdedor pasarán al ganador. <code>use_count</code> se suma y{' '}
          <code>required_skills</code> se une.
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
          >
            {error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GitMerge size={14} />
            {isPending ? 'Fusionando…' : 'Fusionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
