import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  UserCheck,
  UserPlus,
  Circle,
  ArrowRight,
  CalendarPlus,
  Eye,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PreviewRow, WizardState, ImportReport } from '../types/import.types';
import { useImportSubmit } from '../hooks';
import { previewRowToImportRow, findIntraFileDuplicates } from '../utils/mapping';
import { RawRowModal } from './Step3Preview/RawRowModal';

interface Step4ConfirmProps {
  state: WizardState;
  onImportStart: () => void;
  onImportDone: (report: ImportReport) => void;
  onGoToOrders: () => void;
  onAssignToPlan?: (orderIds: string[]) => void;
}

export function Step4Confirm({
  state,
  onImportStart,
  onImportDone,
  onGoToOrders,
  onAssignToPlan,
}: Step4ConfirmProps) {
  const { submit, cancel, progress, isSubmitting, error, report } = useImportSubmit();
  const [rawWarningRow, setRawWarningRow] = useState<PreviewRow | null>(null);

  const intraDupes = useMemo(() => new Set(findIntraFileDuplicates(state.previewRows)), [state.previewRows]);
  const dbDupes = useMemo(() => new Set(state.dedupExisting), [state.dedupExisting]);

  /**
   * Filas elegibles para submit:
   *  - sin error de validación
   *  - geocoding ok o warning (no error)
   *  - order_number NO duplicado en CSV (toma la primera ocurrencia)
   *  - order_number NO existe ya en DB
   */
  const importableRows = useMemo(() => {
    const seenIntra = new Set<string>();
    const out: PreviewRow[] = [];
    for (const r of state.previewRows) {
      if (r.error || r.geocodingStatus === 'error') continue;
      const num = r.values.order_number?.trim();
      if (num && dbDupes.has(num)) continue;
      if (num && intraDupes.has(num)) {
        if (seenIntra.has(num)) continue;
        seenIntra.add(num);
      }
      out.push(r);
    }
    return out;
  }, [state.previewRows, intraDupes, dbDupes]);

  const counters = useMemo(() => {
    let high = 0;
    let medium = 0;
    let newOnes = 0;
    let errors = 0;
    let dedupSkipped = 0;
    const seenIntra = new Set<string>();

    for (const r of state.previewRows) {
      if (r.error || r.geocodingStatus === 'error') {
        errors++;
        continue;
      }
      const num = r.values.order_number?.trim();
      if (num && dbDupes.has(num)) {
        dedupSkipped++;
        continue;
      }
      if (num && intraDupes.has(num)) {
        if (seenIntra.has(num)) {
          dedupSkipped++;
          continue;
        }
        seenIntra.add(num);
      }
      const willReuse =
        r.matchQuality === 'medium'
          ? !r.overrideCreateNew && state.mediumPolicy === 'reuse'
          : false;
      if (r.matchQuality === 'high' || willReuse) {
        if (r.matchQuality === 'high') high++;
        else medium++;
      } else {
        newOnes++;
      }
    }
    return {
      total: state.previewRows.length,
      importable: importableRows.length,
      high,
      medium,
      newOnes,
      errors,
      dedupSkipped,
    };
  }, [state.previewRows, intraDupes, dbDupes, state.mediumPolicy, importableRows]);

  async function handleImport() {
    const conversionWarnings: { row: PreviewRow; warnings: string[] }[] = [];
    const rows = importableRows.map((r) => {
      // Aplicar la política global de medium si el user no hizo override individual.
      const effectiveOverride =
        r.matchQuality === 'medium' && !r.overrideCreateNew && state.mediumPolicy === 'create_new'
          ? true
          : r.overrideCreateNew;
      const adjusted: PreviewRow = effectiveOverride
        ? { ...r, overrideCreateNew: true, stopId: null }
        : r;
      const conv = previewRowToImportRow(adjusted);
      if (conv.warnings.length > 0) conversionWarnings.push({ row: r, warnings: conv.warnings });
      return conv.row;
    });

    onImportStart();
    const res = await submit(rows, state.templateId);

    if (res) {
      const enrichedReport: ImportReport = {
        ...res,
        warnings: [
          ...res.warnings,
          ...conversionWarnings.flatMap(({ row, warnings }) =>
            warnings.map((w) => `[fila ${row.id}] ${w}`),
          ),
        ],
      };
      onImportDone(enrichedReport);
    }
  }

  // Vista post-import: mostramos el reporte final.
  if (report) {
    const failedRows = state.previewRows.filter(
      (r) => r.error || r.geocodingStatus === 'error',
    );
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-emerald-900">Importación completada</div>
            <p className="text-xs text-emerald-800 mt-0.5">
              {report.created} pedido{report.created === 1 ? '' : 's'} creado
              {report.created === 1 ? '' : 's'}
              {report.failed > 0 && ` · ${report.failed} fallido${report.failed === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <StatCard
            icon={<UserCheck size={14} className="text-blue-600" />}
            label="Match alto"
            value={report.matchStats.high}
          />
          <StatCard
            icon={<Circle size={10} className="fill-amber-400 stroke-amber-600" />}
            label="Match medio"
            value={report.matchStats.medium}
          />
          <StatCard
            icon={<UserPlus size={14} className="text-gray-600" />}
            label="Nuevas"
            value={report.matchStats.created}
          />
          <StatCard
            icon={<AlertCircle size={14} className="text-red-600" />}
            label="Fallidas"
            value={report.failed}
          />
        </div>

        {report.warnings.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-medium">
                {report.warnings.length} advertencia{report.warnings.length === 1 ? '' : 's'}
              </div>
              <ul className="list-disc list-inside text-xs opacity-90 space-y-0.5 max-h-40 overflow-y-auto">
                {report.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {report.warnings.length > 10 && (
                  <li className="opacity-70">… y {report.warnings.length - 10} más</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {failedRows.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="px-4 py-2 border-b border-gray-100 text-sm font-medium text-gray-900">
              Filas no importadas ({failedRows.length})
            </div>
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {failedRows.slice(0, 20).map((r, i) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-xs text-gray-400 w-8">{i + 1}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 truncate max-w-[200px]">
                        {r.values.customer_name || <em>sin nombre</em>}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-red-700 truncate max-w-[260px]">
                        {r.error || 'No se pudo geocodificar'}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => setRawWarningRow(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                        >
                          <Eye size={11} />
                          Ver fila
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {failedRows.length > 20 && (
              <div className="px-4 py-1.5 text-[11px] text-gray-500 text-center">
                … y {failedRows.length - 20} más
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {onAssignToPlan && report.orderIds.length > 0 && (
            <button
              onClick={() => onAssignToPlan(report.orderIds)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              <CalendarPlus size={14} />
              Asignar a un plan
            </button>
          )}
          <button
            onClick={onGoToOrders}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ir a pedidos
            <ArrowRight size={14} />
          </button>
        </div>

        {rawWarningRow && (
          <RawRowModal row={rawWarningRow} onClose={() => setRawWarningRow(null)} />
        )}
      </div>
    );
  }

  // Vista previa antes de importar.
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Confirmación</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Revisá el resumen antes de importar. Esta acción crea los pedidos en tu cuenta.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {counters.importable} pedido{counters.importable === 1 ? '' : 's'} listos para importar
          </span>
          <div className="flex items-center gap-3">
            {counters.dedupSkipped > 0 && (
              <span className="text-xs text-amber-700">
                {counters.dedupSkipped} duplicad{counters.dedupSkipped === 1 ? 'o' : 'os'}{' '}
                ignorad{counters.dedupSkipped === 1 ? 'o' : 'os'}
              </span>
            )}
            {counters.errors > 0 && (
              <span className="text-xs text-red-600">
                {counters.errors} con errores
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <StatRow
            icon={<UserCheck size={14} className="text-blue-600" />}
            label="Clientes conocidos"
            value={counters.high}
          />
          <StatRow
            icon={<Circle size={10} className="fill-amber-400 stroke-amber-600" />}
            label="Match medio"
            value={counters.medium}
          />
          <StatRow
            icon={<UserPlus size={14} className="text-gray-600" />}
            label="Ubicaciones nuevas"
            value={counters.newOnes}
          />
        </div>
      </div>

      {isSubmitting && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Loader2 size={14} className="animate-spin" />
            Importando… {progress}%
            <button
              onClick={cancel}
              className="ml-auto rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => void handleImport()}
          disabled={isSubmitting || counters.importable === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Importando…
            </>
          ) : (
            <>
              Importar {counters.importable} pedido{counters.importable === 1 ? '' : 's'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
