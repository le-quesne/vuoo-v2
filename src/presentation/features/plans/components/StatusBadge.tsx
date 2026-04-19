interface StatusBadgeProps {
  status: string;
}

const STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  incomplete: 'bg-orange-100 text-orange-700',
  not_started: 'bg-gray-100 text-gray-600',
  in_transit: 'bg-blue-100 text-blue-700',
};

const LABELS: Record<string, string> = {
  pending: 'Pendiente',
  completed: 'Completada',
  cancelled: 'Cancelada',
  incomplete: 'Incompleta',
  not_started: 'No empezada',
  in_transit: 'En transito',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
        STYLES[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
