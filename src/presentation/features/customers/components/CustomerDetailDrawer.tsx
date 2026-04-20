import { X, MapPin, Package, Phone, Mail, Hash, Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { useCustomerDetail } from '../hooks/useCustomerDetail';
import type { Customer } from '../types/customer.types';

interface CustomerDetailDrawerProps {
  customerId: string | null;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function CustomerDetailDrawer({
  customerId,
  onClose,
  onEdit,
}: CustomerDetailDrawerProps) {
  const { customer, stops, recentOrders, isLoading, error, refetch } =
    useCustomerDetail(customerId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (customerId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customerId, onClose]);

  if (!customerId) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-detail-title"
    >
      <div
        className="flex-1 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="w-full max-w-xl bg-white shadow-xl h-full overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 id="customer-detail-title" className="text-lg font-semibold">
            Detalle del cliente
          </h2>
          <div className="flex items-center gap-2">
            {customer && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(customer)}
                className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                aria-label="Editar cliente"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {isLoading && (
            <div className="text-center text-gray-400 py-8">Cargando detalle…</div>
          )}

          {error && !isLoading && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 px-3 py-1.5 border border-red-200 rounded text-xs hover:bg-red-100"
              >
                Reintentar
              </button>
            </div>
          )}

          {customer && !isLoading && (
            <>
              <section>
                <h3 className="text-xl font-semibold">{customer.name}</h3>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600">
                  {customer.customer_code && (
                    <div className="flex items-center gap-2">
                      <Hash size={14} className="text-gray-400" />
                      <span className="font-mono text-xs">{customer.customer_code}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <a href={`mailto:${customer.email}`} className="hover:text-blue-600">
                        {customer.email}
                      </a>
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-gray-400" />
                      <a href={`tel:${customer.phone}`} className="hover:text-blue-600">
                        {customer.phone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-gray-400">Ventana horaria default</div>
                    <div className="font-medium mt-0.5">
                      {customer.default_time_window_start && customer.default_time_window_end
                        ? `${customer.default_time_window_start} – ${customer.default_time_window_end}`
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-gray-400">Servicio default</div>
                    <div className="font-medium mt-0.5">
                      {customer.default_service_minutes ?? 5} min
                    </div>
                  </div>
                </div>

                {customer.default_required_skills &&
                  customer.default_required_skills.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-400 mb-1">Skills requeridos</div>
                      <div className="flex flex-wrap gap-1.5">
                        {customer.default_required_skills.map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {customer.notes && (
                  <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">
                    {customer.notes}
                  </p>
                )}
              </section>

              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <MapPin size={14} className="text-gray-400" />
                  Ubicaciones asociadas ({stops.length})
                </h4>
                {stops.length === 0 ? (
                  <div className="text-xs text-gray-400 rounded-lg border border-dashed border-gray-200 p-4 text-center">
                    Sin ubicaciones guardadas para este cliente.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                    {stops.map((stop) => (
                      <li key={stop.id} className="px-3 py-2 text-sm">
                        <div className="font-medium">{stop.name}</div>
                        {stop.address && (
                          <div className="text-xs text-gray-500 truncate">{stop.address}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Package size={14} className="text-gray-400" />
                  Últimas órdenes ({recentOrders.length})
                </h4>
                {recentOrders.length === 0 ? (
                  <div className="text-xs text-gray-400 rounded-lg border border-dashed border-gray-200 p-4 text-center">
                    Sin órdenes registradas todavía.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                    {recentOrders.map((o) => (
                      <li key={o.id} className="px-3 py-2 text-sm flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {o.order_number || `Orden ${o.id.slice(0, 8)}`}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {o.address || '—'}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 shrink-0 ml-2">
                          {formatDate(o.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
