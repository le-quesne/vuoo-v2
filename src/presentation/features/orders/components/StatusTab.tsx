import type { StatusFilter } from '../utils';

interface StatusTabProps {
  label: string;
  value: StatusFilter;
  filter: StatusFilter;
  onClick: (v: StatusFilter) => void;
  count: number | null;
  dot?: string;
}

export function StatusTab({ label, value, filter, onClick, count, dot }: StatusTabProps) {
  const active = filter === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {dot && !active && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span>{label}</span>
      {count !== null && (
        <span className={`${active ? 'text-blue-100' : 'text-gray-400'}`}>{count}</span>
      )}
    </button>
  );
}
