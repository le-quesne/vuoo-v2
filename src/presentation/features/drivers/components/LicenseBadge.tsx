import { AlertTriangle } from 'lucide-react';

interface LicenseBadgeProps {
  expiry: string | null;
}

export function LicenseBadge({ expiry }: LicenseBadgeProps) {
  if (!expiry) return <span className="text-gray-400">-</span>;
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const formatted = new Date(expiry).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <AlertTriangle size={12} />
        Vencida
      </span>
    );
  }
  if (days < 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
        <AlertTriangle size={12} />
        Por vencer ({days}d)
      </span>
    );
  }
  return <span className="text-gray-500">{formatted}</span>;
}
