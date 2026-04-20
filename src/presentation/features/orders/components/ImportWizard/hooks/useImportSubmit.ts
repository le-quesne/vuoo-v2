import { useCallback, useState } from 'react';
import * as ordersModule from '@/data/services/orders';
import type { ImportReport } from '../types/import.types';
import type { ImportRow } from '@/data/services/orders/orders.services';

type OrdersService = {
  importFromCsv: (
    rows: ImportRow[],
    templateId: string | null,
    onProgress?: (pct: number) => void,
  ) => Promise<{ success: true; data: ImportReport } | { success: false; error: string }>;
};

function resolveService(): OrdersService | null {
  const mod = ordersModule as unknown as Record<string, unknown>;
  const svc =
    (mod.ordersService as OrdersService | undefined) ??
    (mod as unknown as OrdersService);
  if (svc && typeof svc.importFromCsv === 'function') return svc;
  return null;
}

export interface UseImportSubmitReturn {
  submit: (rows: ImportRow[], templateId: string | null) => Promise<ImportReport | null>;
  progress: number;
  isSubmitting: boolean;
  error: string | null;
  report: ImportReport | null;
  reset: () => void;
}

export function useImportSubmit(): UseImportSubmitReturn {
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setIsSubmitting(false);
    setError(null);
    setReport(null);
  }, []);

  const submit = useCallback(
    async (rows: ImportRow[], templateId: string | null) => {
      const svc = resolveService();
      if (!svc) {
        setError('Servicio de importación no disponible');
        return null;
      }
      setIsSubmitting(true);
      setError(null);
      setProgress(0);
      setReport(null);

      const res = await svc.importFromCsv(rows, templateId, (pct) => {
        setProgress(Math.max(0, Math.min(100, Math.round(pct))));
      });

      setIsSubmitting(false);
      if (!res.success) {
        setError(res.error);
        return null;
      }
      setProgress(100);
      setReport(res.data);
      return res.data;
    },
    [],
  );

  return { submit, progress, isSubmitting, error, report, reset };
}
