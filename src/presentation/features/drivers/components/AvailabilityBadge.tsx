import type { DriverAvailability } from '@/data/types/database';

const AVAILABILITY_META: Record<
  DriverAvailability,
  { label: string; dot: string; text: string; bg: string }
> = {
  online:    { label: 'En línea',      dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  on_break:  { label: 'En pausa',      dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50' },
  busy:      { label: 'Ocupado',       dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50' },
  off_shift: { label: 'Fuera jornada', dot: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-100' },
};

interface AvailabilityBadgeProps {
  availability: DriverAvailability;
}

export function AvailabilityBadge({ availability }: AvailabilityBadgeProps) {
  const meta = AVAILABILITY_META[availability] ?? AVAILABILITY_META.off_shift;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
