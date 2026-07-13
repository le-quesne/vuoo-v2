import { useState } from 'react';
import type { Depot } from '@/data/services/depots';

interface MoveVehiclesModalProps {
  count: number;
  depots: Depot[];
  onClose: () => void;
  onMove: (depotId: string | null) => Promise<void>;
}

export function MoveVehiclesModal({ count, depots, onClose, onMove }: MoveVehiclesModalProps) {
  const [depotId, setDepotId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onMove(depotId || null);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl"
      >
        <h3 className="text-lg font-semibold mb-1">Mover vehículos</h3>
        <p className="text-sm text-gray-500 mb-4">
          {count} vehículo{count === 1 ? '' : 's'} seleccionado{count === 1 ? '' : 's'}
        </p>

        <label className="block text-xs font-medium text-gray-500 mb-1">
          Centro de distribución destino
        </label>
        <select
          value={depotId}
          onChange={(e) => setDepotId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Sin asignar (usa el default de la org)</option>
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Moviendo...' : 'Mover'}
          </button>
        </div>
      </form>
    </div>
  );
}
