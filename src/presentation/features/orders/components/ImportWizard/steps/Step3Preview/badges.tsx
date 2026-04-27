import { Loader2, UserCheck, UserPlus, Circle } from 'lucide-react';
import type { PreviewRow, MatchQuality } from '../../types/import.types';

export function GeoBadge({ status }: { status: PreviewRow['geocodingStatus'] }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600" title="Geocoding confiable">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600" title="Geocoding con baja confianza">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600" title="No se pudo geocodificar">
        <span className="h-2 w-2 rounded-full bg-red-500" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400" title="Pendiente">
      <Loader2 size={12} className="animate-spin" />
    </span>
  );
}

export function MatchBadge({
  row,
  onClick,
}: {
  row: PreviewRow;
  onClick?: () => void;
}) {
  const effective: MatchQuality = row.overrideCreateNew ? 'none' : row.matchQuality;
  if (effective === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-blue-700" title="Cliente conocido">
        <UserCheck size={12} />
        <span className="text-[11px]">Conocido</span>
      </span>
    );
  }
  if (effective === 'medium') {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 text-amber-700 hover:underline"
        title="Revisar match"
      >
        <Circle size={10} className="fill-amber-400 stroke-amber-600" />
        <span className="text-[11px]">Revisar</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-500" title="Nueva ubicación">
      <UserPlus size={12} />
      <span className="text-[11px]">Nueva</span>
    </span>
  );
}
