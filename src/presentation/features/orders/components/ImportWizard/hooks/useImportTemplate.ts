import { useCallback, useEffect, useState } from 'react';
import type { MappingConfig } from '../types/import.types';
import { importTemplatesService } from '@/data/services/importTemplates';
import { useAuth } from '@/application/hooks/useAuth';
import type {
  ImportTemplate as ImportTemplateRow,
  ImportTemplateInsert,
} from '@/data/services/importTemplates';

export interface ImportTemplate {
  id: string;
  name: string;
  columnMap: MappingConfig;
  createdAt?: string;
}

function rowToUi(row: ImportTemplateRow): ImportTemplate {
  return {
    id: row.id,
    name: row.name,
    // column_map está guardado como { canonical: header } — compatible con MappingConfig.
    columnMap: row.column_map as unknown as MappingConfig,
    createdAt: row.created_at,
  };
}

export interface UseImportTemplateReturn {
  templates: ImportTemplate[];
  isLoading: boolean;
  error: string | null;
  save: (name: string, mapping: MappingConfig) => Promise<ImportTemplate | null>;
  load: (templateId: string) => ImportTemplate | null;
  refetch: () => Promise<void>;
}

export function useImportTemplate(): UseImportTemplateReturn {
  const { currentOrg } = useAuth();
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!currentOrg) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const res = await importTemplatesService.list(currentOrg.id);
    if (!res.success) {
      setError(res.error);
      setTemplates([]);
    } else {
      setTemplates(res.data.map(rowToUi));
    }
    setIsLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const save = useCallback(
    async (name: string, mapping: MappingConfig) => {
      if (!currentOrg) {
        setError('No hay organización activa');
        return null;
      }
      setError(null);
      const payload: ImportTemplateInsert = {
        org_id: currentOrg.id,
        name,
        source: 'csv',
        column_map: mapping as unknown as ImportTemplateInsert['column_map'],
      };
      const res = await importTemplatesService.create(payload);
      if (!res.success) {
        setError(res.error);
        return null;
      }
      const ui = rowToUi(res.data);
      setTemplates((prev) => [ui, ...prev]);
      return ui;
    },
    [currentOrg],
  );

  const load = useCallback(
    (templateId: string) => {
      return templates.find((t) => t.id === templateId) ?? null;
    },
    [templates],
  );

  return { templates, isLoading, error, save, load, refetch };
}
