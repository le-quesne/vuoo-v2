import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Search, Star, Plus } from 'lucide-react';
import { customersService } from '@/data/services/customers';
import { stopsService } from '@/data/services/stops';
import { useAuth } from '@/application/hooks/useAuth';
import type { Customer } from '@/data/services/customers';
import type { Stop } from '@/data/types/database';

interface PromoteToCuratedModalProps {
  stop: Stop;
  onClose: () => void;
  onPromoted: () => void;
}

export function PromoteToCuratedModal({ stop, onClose, onPromoted }: PromoteToCuratedModalProps) {
  const { currentOrg } = useAuth();
  const [query, setQuery] = useState(stop.customer_name ?? '');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [skipCustomer, setSkipCustomer] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!currentOrg?.id) return;
      setSearching(true);
      const res = await customersService.list(currentOrg.id, q);
      setSearching(false);
      if (res.success) setSuggestions(res.data.slice(0, 8));
    },
    [currentOrg?.id],
  );

  useEffect(() => {
    if (skipCustomer || selected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected, skipCustomer, search]);

  async function handleCreateCustomer() {
    if (!currentOrg?.id || !query.trim()) return;
    setIsPending(true);
    setError(null);
    const res = await customersService.create({
      org_id: currentOrg.id,
      name: query.trim(),
      customer_code: null,
      email: stop.customer_email ?? null,
      phone: stop.customer_phone ?? null,
      default_required_skills: [],
    });
    setIsPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSelected(res.data);
  }

  async function handlePromote() {
    setIsPending(true);
    setError(null);
    const customerId = skipCustomer ? undefined : selected?.id;
    const res = await stopsService.promoteToCurated(stop.id, customerId);
    setIsPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    window.alert('Ubicación guardada como recurrente.');
    onPromoted();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promote-curated-title"
    >
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            <h3 id="promote-curated-title" className="text-lg font-semibold">
              Guardar como recurrente
            </h3>
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

        <p className="text-xs text-gray-500 mb-4">
          Al promover este stop (<strong>{stop.name}</strong>), los próximos imports
          harán match automáticamente contra él. Opcionalmente, asócialo a un cliente.
        </p>

        <label className="flex items-center gap-2 text-sm mb-3">
          <input
            type="checkbox"
            checked={skipCustomer}
            onChange={(e) => {
              setSkipCustomer(e.target.checked);
              if (e.target.checked) setSelected(null);
            }}
          />
          <span>No asociar a un cliente (solo marcar como curado)</span>
        </label>

        {!skipCustomer && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-500">
              Cliente asociado
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={selected ? selected.name : query}
                onChange={(e) => {
                  setSelected(null);
                  setQuery(e.target.value);
                }}
                placeholder="Buscar cliente o crear nuevo…"
                aria-label="Buscar cliente"
                className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {!selected && query.trim().length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto bg-white">
                {searching && (
                  <div className="p-3 text-xs text-gray-400">Buscando…</div>
                )}
                {!searching && suggestions.length > 0 && (
                  <ul>
                    {suggestions.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <div className="font-medium">{c.name}</div>
                          {c.customer_code && (
                            <div className="text-xs text-gray-400 font-mono">
                              {c.customer_code}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && suggestions.length === 0 && (
                  <button
                    type="button"
                    onClick={() => void handleCreateCustomer()}
                    disabled={isPending}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Plus size={14} className="text-blue-500" />
                    Crear cliente <strong className="ml-1 truncate">{query}</strong>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
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
            onClick={() => void handlePromote()}
            disabled={isPending || (!skipCustomer && !selected)}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Promoviendo…' : 'Promover'}
          </button>
        </div>
      </div>
    </div>
  );
}
