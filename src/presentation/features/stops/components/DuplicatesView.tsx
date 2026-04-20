import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, GitMerge } from 'lucide-react';
import { stopsService } from '@/data/services/stops';
import { useAuth } from '@/application/hooks/useAuth';
import type { Stop } from '@/data/types/database';
import { MergeStopsModal } from './MergeStopsModal';

export interface DuplicatePair {
  a_id: string;
  b_id: string;
  a_address: string | null;
  b_address: string | null;
  score: number;
}

export function DuplicatesView() {
  const { currentOrg } = useAuth();
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePair, setActivePair] = useState<{
    a: Stop;
    b: Stop;
    score: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!currentOrg?.id) {
      setPairs([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const res = await stopsService.listDuplicates(currentOrg.id);
    setIsLoading(false);
    if (!res.success) {
      setError(res.error);
      setPairs([]);
      return;
    }
    setPairs(res.data as DuplicatePair[]);
  }, [currentOrg?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openMerge(pair: DuplicatePair) {
    if (!currentOrg?.id) return;
    // Traemos todos los stops del org una vez (scope chico: org) y filtramos en cliente.
    const res = await stopsService.listStops(currentOrg.id);
    if (!res.success) {
      window.alert(`No se pudieron cargar los detalles: ${res.error}`);
      return;
    }
    const a = res.data.find((s) => s.id === pair.a_id) ?? null;
    const b = res.data.find((s) => s.id === pair.b_id) ?? null;
    if (!a || !b) {
      window.alert('No se encontraron los stops seleccionados.');
      return;
    }
    setActivePair({ a, b, score: pair.score });
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 pt-6 pb-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h1 className="text-xl font-semibold">Posibles duplicados</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Ubicaciones con dirección idéntica o similar. Fusiónalas para mantener el cache
          limpio.
        </p>
      </header>

      <div className="flex-1 p-6">
        {isLoading && (
          <div className="text-center text-gray-400 py-10">Buscando duplicados…</div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 px-3 py-1.5 border border-red-200 rounded text-xs hover:bg-red-100"
            >
              Reintentar
            </button>
          </div>
        )}

        {!isLoading && !error && pairs.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
            No hay duplicados detectados. 🎉
          </div>
        )}

        {!isLoading && !error && pairs.length > 0 && (
          <ul className="space-y-2">
            {pairs.map((p) => (
              <li
                key={`${p.a_id}-${p.b_id}`}
                className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-400 mb-0.5">Stop A</div>
                    <div className="text-sm font-medium truncate">
                      {p.a_address ?? '—'}
                    </div>
                    <div className="text-xs text-gray-400 font-mono truncate">
                      {p.a_id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-400 mb-0.5">Stop B</div>
                    <div className="text-sm font-medium truncate">
                      {p.b_address ?? '—'}
                    </div>
                    <div className="text-xs text-gray-400 font-mono truncate">
                      {p.b_id.slice(0, 8)}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      p.score >= 0.95
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : p.score >= 0.9
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}
                  >
                    {(p.score * 100).toFixed(0)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => void openMerge(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
                  >
                    <GitMerge size={14} />
                    Fusionar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activePair && (
        <MergeStopsModal
          stopA={activePair.a}
          stopB={activePair.b}
          score={activePair.score}
          onClose={() => setActivePair(null)}
          onMerged={() => {
            setActivePair(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
