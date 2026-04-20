import { Search, Pencil, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Customer } from '../types/customer.types';

// `last_used_at` se propone en el PRD 12 §A.2.1 pero todavía no está en el schema
// del servicio. Lo leemos de forma defensiva para cuando se añada.
type CustomerWithUsage = Customer & { last_used_at?: string | null };

interface CustomerListProps {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onDeactivate: (customer: Customer) => void;
  onRetry?: () => void;
}

const PAGE_SIZE = 20;

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

export function CustomerList({
  customers,
  isLoading,
  error,
  query,
  onQueryChange,
  onSelect,
  onEdit,
  onDeactivate,
  onRetry,
}: CustomerListProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const from = (pageSafe - 1) * PAGE_SIZE;
    return customers.slice(from, from + PAGE_SIZE);
  }, [customers, pageSafe]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar cliente por nombre o código…"
            aria-label="Buscar cliente"
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <span className="text-xs text-gray-400">{customers.length} clientes</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Código</th>
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Teléfono</th>
              <th className="p-3 font-medium">Último uso</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  Cargando clientes…
                </td>
              </tr>
            )}
            {!isLoading && error && (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <p className="text-sm text-red-600 mb-2">{error}</p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                    >
                      Reintentar
                    </button>
                  )}
                </td>
              </tr>
            )}
            {!isLoading && !error && pageItems.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-400">
                  {query
                    ? 'Sin resultados para tu búsqueda.'
                    : 'Aún no hay clientes. Crea el primero o importa un CSV.'}
                </td>
              </tr>
            )}
            {!isLoading &&
              !error &&
              pageItems.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer group"
                >
                  <td className="p-3 text-gray-600 font-mono text-xs">
                    {c.customer_code ?? '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      {!c.is_active && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                          Inactivo
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-gray-500 truncate max-w-[200px]">
                    {c.email ?? '—'}
                  </td>
                  <td className="p-3 text-gray-500">{c.phone ?? '—'}</td>
                  <td className="p-3 text-gray-500">
                    {formatDate((c as CustomerWithUsage).last_used_at)}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(c);
                        }}
                        aria-label={`Editar ${c.name}`}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil size={14} />
                      </button>
                      {c.is_active && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeactivate(c);
                          }}
                          aria-label={`Desactivar ${c.name}`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, pageSafe - 1))}
            disabled={pageSafe === 1}
            aria-label="Página anterior"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-500">
            {pageSafe} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, pageSafe + 1))}
            disabled={pageSafe === totalPages}
            aria-label="Página siguiente"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
