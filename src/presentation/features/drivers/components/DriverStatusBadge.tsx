import type { DriverStatus } from '@/data/types/database';

const STYLES: Record<DriverStatus, string> = {
  active: 'bg-green-50 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  on_leave: 'bg-yellow-50 text-yellow-700',
};

const LABELS: Record<DriverStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  on_leave: 'Con permiso',
};

interface DriverStatusBadgeProps {
  status: DriverStatus;
}

export function DriverStatusBadge({ status }: DriverStatusBadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
