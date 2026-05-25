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
          placeholder="Buscar conductor, vehículo o plan…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-300"
        />
      </div>
      <div className="flex gap-3 text-xs overflow-x-auto -mx-1 px-1">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`relative pb-1.5 whitespace-nowrap transition-colors ${
                active
                  ? 'text-gray-900 font-medium after:absolute after:left-0 after:right-0 after:bottom-0 after:h-px after:bg-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
