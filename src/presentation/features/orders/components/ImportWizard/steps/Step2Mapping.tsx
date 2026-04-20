import { useEffect, useMemo, useState } from 'react';
import { Save, Wand2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type {
  CanonicalColumn,
  MappingConfig,
  WizardState,
} from '../types/import.types';
import {
  CANONICAL_COLUMNS,
  CANONICAL_LABELS,
  REQUIRED_COLUMNS,
} from '../types/import.types';
import { useColumnAutoDetect, useImportTemplate } from '../hooks';
import type { ImportTemplate } from '../hooks';

interface Step2MappingProps {
  state: WizardState;
  onMappingChange: (mapping: MappingConfig) => void;
  onTemplateSelected: (templateId: string | null) => void;
}

export function Step2Mapping({
  state,
  onMappingChange,
  onTemplateSelected,
}: Step2MappingProps) {
  const autoMapping = useColumnAutoDetect(state.headers);
  const { templates, save, isLoading, error } = useImportTemplate();
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Aplicar auto-detect una sola vez cuando llegan los headers.
  useEffect(() => {
    const isEmpty = Object.values(state.mapping).every((v) => v === null);
    if (isEmpty && state.headers.length > 0) {
      onMappingChange(autoMapping);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.headers]);

  const missingRequired = useMemo(
    () => REQUIRED_COLUMNS.filter((c) => !state.mapping[c]),
    [state.mapping],
  );

  function updateMapping(col: CanonicalColumn, header: string | null) {
    onMappingChange({ ...state.mapping, [col]: header });
  }

  function applyTemplate(tpl: ImportTemplate) {
    // Si alguna columna de la plantilla no existe en el CSV actual, la dejamos null.
    const next: MappingConfig = { ...state.mapping };
    for (const col of CANONICAL_COLUMNS) {
      const tplHeader = tpl.columnMap[col];
      next[col] = tplHeader && state.headers.includes(tplHeader) ? tplHeader : null;
    }
    onMappingChange(next);
    onTemplateSelected(tpl.id);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    const res = await save(templateName.trim(), state.mapping);
    if (res) {
      setSavedFeedback(`Plantilla "${res.name}" guardada`);
      setTemplateName('');
      setSavingTemplate(false);
      onTemplateSelected(res.id);
      setTimeout(() => setSavedFeedback(null), 3000);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Mapeá tus columnas
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Vuoo detecta automáticamente las columnas conocidas. Ajustá lo que
          haga falta o cargá una plantilla guardada.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Plantilla guardada
          </label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={state.templateId ?? ''}
            disabled={isLoading}
            onChange={(e) => {
              const id = e.target.value || null;
              if (!id) {
                onTemplateSelected(null);
                return;
              }
              const tpl = templates.find((t) => t.id === id);
              if (tpl) applyTemplate(tpl);
            }}
          >
            <option value="">— Sin plantilla —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => onMappingChange(autoMapping)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          title="Re-ejecutar detección automática"
        >
          <Wand2 size={14} />
          Auto-detectar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>No se pudieron cargar plantillas: {error}</span>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campo Vuoo</th>
              <th className="px-3 py-2 text-left font-medium">
                Columna del archivo
              </th>
              <th className="px-3 py-2 text-left font-medium">Ejemplo</th>
            </tr>
          </thead>
          <tbody>
            {CANONICAL_COLUMNS.map((col) => {
              const isRequired = REQUIRED_COLUMNS.includes(col);
              const selected = state.mapping[col];
              const sample = selected ? state.rawRows[0]?.[selected] ?? '' : '';
              return (
                <tr key={col} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">
                      {CANONICAL_LABELS[col]}
                      {isRequired && (
                        <span className="ml-1 text-red-500" aria-label="obligatorio">
                          *
                        </span>
                      )}
                    </div>
                    <code className="text-[11px] text-gray-400">{col}</code>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={selected ?? ''}
                      onChange={(e) =>
                        updateMapping(col, e.target.value || null)
                      }
                      className={[
                        'w-full rounded-lg border px-2 py-1.5 text-sm',
                        isRequired && !selected
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-200',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <option value="">— No mapeado —</option>
                      {state.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[220px] truncate">
                    {sample || <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            Faltan columnas obligatorias:{' '}
            {missingRequired.map((c) => CANONICAL_LABELS[c]).join(', ')}
          </span>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        {savedFeedback && (
          <div className="flex items-center gap-2 mb-3 text-sm text-emerald-700">
            <CheckCircle2 size={14} />
            {savedFeedback}
          </div>
        )}
        {!savingTemplate ? (
          <button
            onClick={() => setSavingTemplate(true)}
            disabled={missingRequired.length > 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save size={14} />
            Guardar como plantilla
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Nombre (ej. Shopify export)"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveTemplate();
                if (e.key === 'Escape') {
                  setSavingTemplate(false);
                  setTemplateName('');
                }
              }}
            />
            <button
              onClick={() => void handleSaveTemplate()}
              disabled={!templateName.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              onClick={() => {
                setSavingTemplate(false);
                setTemplateName('');
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
