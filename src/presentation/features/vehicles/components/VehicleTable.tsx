import { Pencil, Trash2, Warehouse } from 'lucide-react';
import type { Vehicle } from '@/data/types/database';
import { VehicleAvatar } from './VehicleAvatar';
import { FUEL_TYPE_LABEL } from '../utils/constants';

interface VehicleTableProps {
  title: string;
  badge?: string;
  vehicles: Vehicle[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onEdit: (v: Vehicle) => void;
  onDelete: (v: Vehicle) => void;
}

export function VehicleTable({
  title,
  badge,
  vehicles,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
}: VehicleTableProps) {
  const ids = vehicles.map((v) => v.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Warehouse size={15} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {badge && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-50 text-indigo-600">
            {badge}
          </span>
        )}
        <span className="text-xs text-gray-400">
          {vehicles.length} vehículo{vehicles.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 w-8">
                {vehicles.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onToggleSelectAll(ids)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                )}
              </th>
              <th className="p-3 font-medium w-8"></th>
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Matrícula</th>
              <th className="p-3 font-medium">Marca</th>
              <th className="p-3 font-medium">Modelo</th>
              <th className="p-3 font-medium">Precio/km ($)</th>
              <th className="p-3 font-medium">Combustible</th>
              <th className="p-3 font-medium">Consumo medio</th>
              <th className="p-3 font-medium">Capacidad (kg)</th>
              <th className="p-3 font-medium">Fecha creación</th>
              <th className="p-3 font-medium w-20">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, i) => (
              <tr
                key={v.id}
                onClick={() => onEdit(v)}
                className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(v.id)}
                    onChange={() => onToggleSelect(v.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                </td>
                <td className="p-3">
                  <VehicleAvatar name={v.name} index={i} />
                </td>
                <td className="p-3 font-medium">{v.name}</td>
                <td className="p-3 text-gray-500">{v.license_plate ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.brand ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.model ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.price_per_km ?? '-'}</td>
                <td className="p-3 text-gray-500">{FUEL_TYPE_LABEL[v.fuel_type]}</td>
                <td className="p-3 text-gray-500">
                  {v.avg_consumption ? `${v.avg_consumption}L/100km` : '-'}
                </td>
                <td className="p-3 text-gray-500">{v.capacity_weight_kg}kg</td>
                <td className="p-3 text-gray-500">
                  {new Date(v.created_at).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(v);
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(v);
                      }}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6 text-center text-gray-400 text-xs">
                  Sin vehículos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
