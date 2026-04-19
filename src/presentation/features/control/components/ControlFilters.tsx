import { Search } from 'lucide-react';
import type { ControlFilterKey } from '../hooks/useRouteFiltering';

interface ControlFiltersProps {
  search: string;
  onSearchChange: (s: string) => void;
  filter: ControlFilterKey;
  onFilterChange: (f: ControlFilterKey) => void;
}

const FILTERS: Array<{ key: ControlFilterKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'in_transit', label: 'En ruta' },
  { key: 'problems', label: 'Problemas' },
  { key: 'offline', label: 'Offline' },
  { key: 'completed', label: 'Completadas' },
];

export function ControlFilters({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: ControlFiltersProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar conductor, vehiculo o plan..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={`px-2.5 py-1 text-xs rounded-full border whitespace-nowrap ${
              filter === f.key
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
