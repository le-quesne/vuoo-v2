import { AlertCircle, Loader2 } from 'lucide-react';

interface DedupBannerProps {
  isChecking: boolean;
  existingCount: number;
  intraFileDuplicates: string[];
}

/**
 * Banner que avisa al user de duplicados detectados en Step 3.
 * - existingCount: order_numbers que ya están en la DB de la org.
 * - intraFileDuplicates: order_numbers que aparecen >1 vez en el mismo CSV.
 *
 * Acción default: ignoramos esas filas (no se importan). Reemplazar update-en-place
 * queda en TODOS para post-piloto.
 */
export function DedupBanner({
  isChecking,
  existingCount,
  intraFileDuplicates,
}: DedupBannerProps) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
        <Loader2 size={14} className="animate-spin" />
        Verificando duplicados con la base de datos…
      </div>
    );
  }

  if (existingCount === 0 && intraFileDuplicates.length === 0) return null;

  return (
    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <div className="space-y-1">
        {existingCount > 0 && (
          <div>
            <span className="font-medium">
              {existingCount} pedido{existingCount === 1 ? '' : 's'}
            </span>{' '}
            ya {existingCount === 1 ? 'existe' : 'existen'} en tu cuenta y se ignorarán al importar.
          </div>
        )}
        {intraFileDuplicates.length > 0 && (
          <div>
            <span className="font-medium">
              {intraFileDuplicates.length} número{intraFileDuplicates.length === 1 ? '' : 's'} de pedido
            </span>{' '}
            aparece{intraFileDuplicates.length === 1 ? '' : 'n'} más de una vez en el archivo (
            {intraFileDuplicates.slice(0, 5).join(', ')}
            {intraFileDuplicates.length > 5 ? '…' : ''}). Solo importaremos la primera ocurrencia.
          </div>
        )}
      </div>
    </div>
  );
}
