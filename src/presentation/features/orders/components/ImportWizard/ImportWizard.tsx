import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type {
  ImportReport,
  MappingConfig,
  PreviewRow,
  WizardState,
} from './types/import.types';
import { emptyMapping, REQUIRED_COLUMNS } from './types/import.types';
import { Step1FileDrop } from './steps/Step1FileDrop';
import { Step2Mapping } from './steps/Step2Mapping';
import { Step3Preview } from './steps/Step3Preview';
import { Step4Confirm } from './steps/Step4Confirm';

export interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (report: ImportReport) => void;
  defaultTemplateId?: string;
}

const STEP_LABELS: Record<WizardState['step'], string> = {
  1: 'Archivo',
  2: 'Mapeo',
  3: 'Vista previa',
  4: 'Confirmar',
};

function initialState(defaultTemplateId?: string): WizardState {
  return {
    step: 1,
    file: null,
    fileName: '',
    headers: [],
    rawRows: [],
    mapping: emptyMapping(),
    templateId: defaultTemplateId ?? null,
    previewRows: [],
    isPreviewLoading: false,
    importProgress: 0,
    importReport: null,
    error: null,
  };
}

export function ImportWizard(props: ImportWizardProps) {
  // Re-mount full internal state on each open cycle usando `open` como key.
  // Evita setState dentro de useEffect (patrón anti lint).
  if (!props.open) return null;
  return <ImportWizardInner {...props} key={props.open ? 'open' : 'closed'} />;
}

function ImportWizardInner({
  onClose,
  onComplete,
  defaultTemplateId,
}: ImportWizardProps) {
  const [state, setState] = useState<WizardState>(() =>
    initialState(defaultTemplateId),
  );
  const [confirmClose, setConfirmClose] = useState(false);
  const open = true;

  const hasProgress = useMemo(
    () => state.file !== null && !state.importReport,
    [state.file, state.importReport],
  );

  const canAdvance = useMemo(() => {
    if (state.step === 1) return state.rawRows.length > 0;
    if (state.step === 2) {
      return REQUIRED_COLUMNS.every((c) => !!state.mapping[c]);
    }
    if (state.step === 3) {
      const importable = state.previewRows.filter(
        (r) => !r.error && r.geocodingStatus !== 'error',
      ).length;
      return importable > 0 && !state.isPreviewLoading;
    }
    return false;
  }, [state]);

  const requestClose = useCallback(() => {
    if (!hasProgress) {
      onClose();
      return;
    }
    setConfirmClose(true);
  }, [hasProgress, onClose]);

  // Keyboard: Esc cierra, Enter avanza si es seguro.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmClose) setConfirmClose(false);
        else requestClose();
      }
      if (e.key === 'Enter' && !confirmClose) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (canAdvance && state.step < 4) {
          setState((s) => ({ ...s, step: (s.step + 1) as WizardState['step'] }));
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canAdvance, state.step, requestClose, confirmClose]);

  const handleFileLoaded = useCallback(
    (args: {
      file: File;
      fileName: string;
      headers: string[];
      rawRows: Record<string, string>[];
    }) => {
      setState((s) => ({
        ...s,
        file: args.file,
        fileName: args.fileName,
        headers: args.headers,
        rawRows: args.rawRows,
        mapping: emptyMapping(),
        previewRows: [],
      }));
    },
    [],
  );

  const handleMappingChange = useCallback((mapping: MappingConfig) => {
    setState((s) => ({ ...s, mapping, previewRows: [] }));
  }, []);

  const handleTemplateSelected = useCallback((templateId: string | null) => {
    setState((s) => ({ ...s, templateId }));
  }, []);

  const handlePreviewRowsChange = useCallback((rows: PreviewRow[]) => {
    setState((s) => ({ ...s, previewRows: rows }));
  }, []);

  const handlePreviewLoading = useCallback((loading: boolean) => {
    setState((s) => ({ ...s, isPreviewLoading: loading }));
  }, []);

  const handleImportDone = useCallback(
    (report: ImportReport) => {
      setState((s) => ({ ...s, importReport: report }));
      onComplete(report);
    },
    [onComplete],
  );

  const goNext = useCallback(() => {
    if (!canAdvance || state.step >= 4) return;
    setState((s) => ({ ...s, step: (s.step + 1) as WizardState['step'] }));
  }, [canAdvance, state.step]);

  const goBack = useCallback(() => {
    if (state.step <= 1) return;
    setState((s) => ({ ...s, step: (s.step - 1) as WizardState['step'] }));
  }, [state.step]);

  // `open` siempre es true acá — el wrapper `ImportWizard` monta este
  // componente sólo cuando corresponde; evita el patrón de reset via effect.
  void open;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={requestClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Importar pedidos"
      >
        {/* Header con stepper */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Importar pedidos
            </h2>
            <button
              onClick={requestClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <Stepper currentStep={state.step} />
        </div>

        {/* Cuerpo del paso actual */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state.step === 1 && (
            <Step1FileDrop state={state} onFileLoaded={handleFileLoaded} />
          )}
          {state.step === 2 && (
            <Step2Mapping
              state={state}
              onMappingChange={handleMappingChange}
              onTemplateSelected={handleTemplateSelected}
            />
          )}
          {state.step === 3 && (
            <Step3Preview
              state={state}
              onPreviewRowsChange={handlePreviewRowsChange}
              onLoadingChange={handlePreviewLoading}
            />
          )}
          {state.step === 4 && (
            <Step4Confirm
              state={state}
              onImportStart={() =>
                setState((s) => ({ ...s, importProgress: 0 }))
              }
              onImportDone={handleImportDone}
              onGoToOrders={onClose}
            />
          )}
        </div>

        {/* Footer con navegación */}
        {!state.importReport && (
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <button
              onClick={goBack}
              disabled={state.step === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Atrás
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={requestClose}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              {state.step < 4 && (
                <button
                  onClick={goNext}
                  disabled={!canAdvance}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Siguiente
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Confirm close */}
        {confirmClose && (
          <div
            className="absolute inset-0 z-[70] flex items-center justify-center bg-black/30 rounded-xl"
            onClick={() => setConfirmClose(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-gray-900">
                ¿Descartar la importación?
              </h3>
              <p className="text-sm text-gray-600 mt-1.5">
                Vas a perder el mapeo y el preview. Esta acción no importa nada.
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setConfirmClose(false)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Seguir
                </button>
                <button
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Stepper visual 1 → 2 → 3 → 4
// ──────────────────────────────────────────────────────────────────────────
function Stepper({ currentStep }: { currentStep: WizardState['step'] }) {
  const steps: WizardState['step'][] = [1, 2, 3, 4];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, idx) => {
        const isDone = s < currentStep;
        const isCurrent = s === currentStep;
        return (
          <li key={s} className="flex items-center gap-2 flex-1">
            <div
              className={[
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                isCurrent && 'bg-blue-600 text-white',
                isDone && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                !isCurrent && !isDone && 'bg-gray-100 text-gray-500',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={[
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                  isCurrent && 'bg-white/20 text-white',
                  isDone && 'bg-emerald-600 text-white',
                  !isCurrent && !isDone && 'bg-white text-gray-500 border border-gray-200',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isDone ? <Check size={12} /> : s}
              </span>
              {STEP_LABELS[s]}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  'h-px flex-1 min-w-[8px]',
                  s < currentStep ? 'bg-emerald-300' : 'bg-gray-200',
                ].join(' ')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
