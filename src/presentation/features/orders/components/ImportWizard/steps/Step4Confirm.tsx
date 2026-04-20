import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  UserCheck,
  UserPlus,
  Circle,
  ArrowRight,
} from 'lucide-react';
import { useMemo } from 'react';
import type { WizardState, ImportReport } from '../types/import.types';
import { useImportSubmit } from '../hooks';

interface Step4ConfirmProps {
  state: WizardState;
  onImportStart: () => void;
  onImportDone: (report: ImportReport) => void;
  onGoToOrders: () => void;
}

export function Step4Confirm({
  state,
  onImportStart,
  onImportDone,
  onGoToOrders,
}: Step4ConfirmProps) {
  const { submit, progress, isSubmitting, error, report } = useImportSubmit();

  const counters = useMemo(() => {
    let high = 0;
    let medium = 0;
    let newOnes = 0;
    let errors = 0;
    for (const r of state.previewRows) {
      if (r.error || r.geocodingStatus === 'error') {
        errors++;
        continue;
      }
      if (r.overrideCreateNew) {
        newOnes++;
        continue;
      }
      if (r.matchQuality === 'high') high++;
      else if (r.matchQuality === 'medium') medium++;
      else newOnes++;
    }
    return {
      total: state.previewRows.length,
      importable: state.previewRows.length - errors,
      high,
      medium,
      newOnes,
      errors,
    };
  }, [state.previewRows]);

  async function handleImport() {
    const rows = state.previewRows
      .filter((r) => !r.error && r.geocodingStatus !== 'error')
      .map((r) => {
        const weight = toOptionalNumber(r.values.total_weight_kg);
        const volume = toOptionalNumber(r.values.volume_m3);
        return {
          customer_name: (r.values.customer_name ?? '').trim(),
          customer_phone: r.values.customer_phone?.trim() || null,
          customer_email: r.values.customer_email?.trim() || null,
          address: (r.values.address ?? '').trim(),
          lat: r.lat,
          lng: r.lng,
          total_weight_kg: weight ?? 0,
          total_volume_m3: volume ?? null,
          time_window_start: r.values.time_window_start?.trim() || null,
          time_window_end: r.values.time_window_end?.trim() || null,
          priority: normalizePriority(r.values.priority),
          requested_date: r.values.requested_date?.trim() || null,
          order_number: r.values.order_number?.trim() || undefined,
          internal_notes: r.values.internal_notes?.trim() || null,
        };
      });

    onImportStart();
    const res = await submit(rows, state.templateId);
    if (res) onImportDone(res);
  }

  // Vista post-import: mostramos el reporte final.
  if (report) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-emerald-900">
              Importación completada
            </div>
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

        <div className="flex justify-end">
          <button
            onClick={onGoToOrders}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ir a pedidos
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Vista previa antes de importar.
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Confirmación
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Revisá el resumen antes de importar. Esta acción crea los pedidos
          en tu cuenta.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {counters.importable} pedido{counters.importable === 1 ? '' : 's'} listos para importar
          </span>
          {counters.errors > 0 && (
            <span className="text-xs text-red-600">
              {counters.errors} fila{counters.errors === 1 ? '' : 's'} se omitirán por errores
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <StatRow
            icon={<UserCheck size={14} className="text-blue-600" />}
            label="Clientes conocidos"
            value={counters.high}
          />
          <StatRow
            icon={<Circle size={10} className="fill-amber-400 stroke-amber-600" />}
            label="A revisar"
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

function toOptionalNumber(v: string | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function normalizePriority(
  v: string | undefined,
): 'urgent' | 'high' | 'normal' | 'low' | undefined {
  if (!v) return undefined;
  const low = v.trim().toLowerCase();
  if (low === 'urgent' || low === 'high' || low === 'normal' || low === 'low') {
    return low;
  }
  return 'normal';
}
