import { memo } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';
import type { PreviewRow } from '../../types/import.types';
import { GeoBadge, MatchBadge } from './badges';

interface PreviewTableProps {
  rows: PreviewRow[];
  duplicatedOrderNumbers: Set<string>;
  onPinDrop: (rowId: string) => void;
  onMatchReview: (rowId: string) => void;
  onShowRaw: (rowId: string) => void;
}

interface RowProps {
  row: PreviewRow;
  index: number;
  isDuplicate: boolean;
  onPinDrop: (rowId: string) => void;
  onMatchReview: (rowId: string) => void;
  onShowRaw: (rowId: string) => void;
}

const TableRow = memo(function TableRow({
  row,
  index,
  isDuplicate,
  onPinDrop,
  onMatchReview,
  onShowRaw,
}: RowProps) {
  const isError = !!row.error || row.geocodingStatus === 'error' || isDuplicate;
  return (
    <tr
      className={[
        'border-t border-gray-100',
        isError ? 'bg-red-50/40' : '',
        isDuplicate ? 'bg-amber-50/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <td className="px-3 py-2 text-gray-400 text-xs">{index + 1}</td>
      <td className="px-3 py-2 truncate max-w-[180px]">
        {row.values.customer_name || <span className="text-gray-400 italic">sin nombre</span>}
      </td>
      <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[260px]">
        {row.values.address || <span className="text-gray-400 italic">sin dirección</span>}
      </td>
      <td className="px-3 py-2">
        <GeoBadge status={row.geocodingStatus} />
      </td>
      <td className="px-3 py-2">
        {!isError && (
          <MatchBadge
            row={row}
            onClick={
              row.matchQuality === 'medium' && !row.overrideCreateNew
                ? () => onMatchReview(row.id)
                : undefined
            }
          />
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          {(row.geocodingStatus === 'warning' || row.geocodingStatus === 'error') && !row.error && (
            <button
              onClick={() => onPinDrop(row.id)}
              className={[
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                row.geocodingStatus === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
              ].join(' ')}
              title="Ajustar ubicación manualmente"
            >
              <MapPin size={12} />
              Pin
            </button>
          )}
          <button
            onClick={() => onShowRaw(row.id)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            title="Ver fila original del archivo"
          >
            Raw
          </button>
          {row.error && (
            <span className="text-[11px] text-red-700 inline-flex items-center gap-1">
              <AlertCircle size={11} />
              {row.error}
            </span>
          )}
          {isDuplicate && !row.error && (
            <span className="text-[11px] text-amber-700">duplicado</span>
          )}
        </div>
      </td>
    </tr>
  );
});

export function PreviewTable({
  rows,
  duplicatedOrderNumbers,
  onPinDrop,
  onMatchReview,
  onShowRaw,
}: PreviewTableProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">Dirección</th>
              <th className="px-3 py-2 text-left font-medium w-24">Geo</th>
              <th className="px-3 py-2 text-left font-medium w-28">Match</th>
              <th className="px-3 py-2 text-left font-medium w-32">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const num = r.values.order_number?.trim();
              const isDuplicate = !!num && duplicatedOrderNumbers.has(num);
              return (
                <TableRow
                  key={r.id}
                  row={r}
                  index={i}
                  isDuplicate={isDuplicate}
                  onPinDrop={onPinDrop}
                  onMatchReview={onMatchReview}
                  onShowRaw={onShowRaw}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
