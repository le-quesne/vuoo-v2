import { useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import {
  CustomerList,
  CustomerForm,
  CustomerDetailDrawer,
  CustomerImportModal,
  useCustomerList,
  useCustomerMutations,
} from '@/presentation/features/customers';
import type { Customer } from '@/presentation/features/customers';

export function CustomersPage() {
  const { customers, isLoading, error, query, setQuery, refetch } = useCustomerList();
  const { deactivate } = useCustomerMutations();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleDeactivate(c: Customer) {
    const confirmed = window.confirm(
      `¿Desactivar a "${c.name}"? Dejará de aparecer en autocompletados.`,
    );
    if (!confirmed) return;
    const ok = await deactivate(c.id);
    if (ok) await refetch();
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 pt-6 pb-4 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Clientes</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Master opcional de clientes recurrentes. Los pedidos pueden asociarse
              automáticamente a un cliente existente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Upload size={16} />
              Importar CSV
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
            >
              <Plus size={16} />
              Nuevo cliente
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6">
        <CustomerList
          customers={customers}
          isLoading={isLoading}
          error={error}
          query={query}
          onQueryChange={setQuery}
          onSelect={(c) => setSelectedId(c.id)}
          onEdit={(c) => setEditing(c)}
          onDeactivate={handleDeactivate}
          onRetry={() => void refetch()}
        />
      </div>

      {creating && (
        <CustomerForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refetch();
          }}
        />
      )}

      {editing && (
        <CustomerForm
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetch();
          }}
        />
      )}

      <CustomerDetailDrawer
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(c) => {
          setSelectedId(null);
          setEditing(c);
        }}
      />

      {importing && (
        <CustomerImportModal
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

export default CustomersPage;
