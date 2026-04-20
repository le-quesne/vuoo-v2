import { useRef, useState } from 'react';
import { Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CsvRow {
  raw?: Record<string, string>;
  order_number?: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  address: string;
  delivery_instructions?: string;
  service_duration_minutes?: number;
  total_weight_kg: number;
  time_window_start: string | null;
  time_window_end: string | null;
  requested_date: string | null;
  internal_notes: string | null;
  lat: number | null;
  lng: number | null;
  error?: string;
  warning?: string;
  geocoded?: boolean;
}

import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import { parseCsv, geocode } from '../utils';

export function ImportCsvModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { user, currentOrg } = useAuth()
  const [rows, setRows] = useState<CsvRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setParsing(true)
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)

      const normalized: CsvRow[] = parsed.map((r) => {
        const name = r.nombre_cliente || r.cliente || r.customer_name || r.nombre || ''
        const address = r.direccion || r.address || ''
        const phone = r.telefono || r.phone || r.customer_phone || ''
        const email = r.email || r.customer_email || ''
        const weightStr = r.peso_kg || r.peso || r.weight_kg || '0'
        const startRaw = r.ventana_inicio || r.hora_inicio || r.time_window_start || ''
        const endRaw = r.ventana_fin || r.hora_fin || r.time_window_end || ''
        const dateRaw = r.fecha || r.fecha_entrega || r.requested_date || ''
        const notes = r.notas || r.items || r.internal_notes || ''

        let err: string | undefined
        if (!name.trim()) err = 'Falta nombre de cliente'
        else if (!address.trim()) err = 'Falta direccion'

        return {
          raw: r,
          customer_name: name.trim(),
          customer_phone: phone.trim() || null,
          customer_email: email.trim() || null,
          address: address.trim(),
          total_weight_kg: Number(weightStr.replace(',', '.')) || 0,
          time_window_start: startRaw.trim() || null,
          time_window_end: endRaw.trim() || null,
          requested_date: dateRaw.trim() || null,
          internal_notes: notes.trim() || null,
          lat: null,
          lng: null,
          error: err,
        }
      })

      // Geocode valid rows (limit concurrency)
      const toGeocode = normalized.filter((r) => !r.error)
      for (let i = 0; i < toGeocode.length; i++) {
        const r = toGeocode[i]
        const coords = await geocode(r.address)
        if (coords) {
          r.lat = coords.lat
          r.lng = coords.lng
          r.geocoded = true
        } else {
          r.warning = 'No se pudo geocodificar la direccion'
        }
      }

      setRows(normalized)
    } catch (e) {
      setError((e as Error).message)
    }
    setParsing(false)
  }

  async function handleImport() {
    if (!currentOrg || !user) return
    const toImport = rows.filter((r) => !r.error)
    if (toImport.length === 0) return

    setImporting(true)
    setError(null)

    for (const r of toImport) {
      const { data: numData, error: numErr } = await supabase.rpc('generate_order_number', {
        p_org_id: currentOrg.id,
      })
      if (numErr) { setError(numErr.message); setImporting(false); return }

      const { error: insErr } = await supabase.from('orders').insert({
        org_id: currentOrg.id,
        order_number: numData as string,
        source: 'csv',
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_email: r.customer_email,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        total_weight_kg: r.total_weight_kg,
        time_window_start: r.time_window_start,
        time_window_end: r.time_window_end,
        requested_date: r.requested_date,
        internal_notes: r.internal_notes,
        status: 'pending',
        created_by: user.id,
      })
      if (insErr) { setError(insErr.message); setImporting(false); return }
    }

    setImporting(false)
    onImported()
  }

  function downloadTemplate() {
    const csv =
      'nombre_cliente,telefono,email,direccion,peso_kg,ventana_inicio,ventana_fin,fecha,notas\n' +
      'Juan Perez,+56912345678,juan@example.cl,Av. Providencia 1234 Santiago,3.5,09:00,12:00,2026-04-12,Fragil'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_pedidos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const valid = rows.filter((r) => !r.error).length
  const invalid = rows.filter((r) => r.error).length
  const warnings = rows.filter((r) => r.warning && !r.error).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-500" />
            <h3 className="text-lg font-semibold">Importar pedidos desde CSV</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {rows.length === 0 && (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg py-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              >
                <Upload size={28} className="mx-auto text-gray-400 mb-2" />
                <div className="text-sm font-medium text-gray-700">Selecciona un archivo CSV</div>
                <div className="text-xs text-gray-400 mt-1">O arrastra aqui (proximamente)</div>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <div className="font-medium text-gray-700 mb-1">Columnas esperadas:</div>
                <code className="block text-[11px] text-gray-600">
                  nombre_cliente, telefono, email, direccion, peso_kg, ventana_inicio, ventana_fin, fecha, notas
                </code>
              </div>
              <button
                onClick={downloadTemplate}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                Descargar plantilla CSV
              </button>
            </>
          )}

          {parsing && <div className="text-center text-sm text-gray-500 py-8">Procesando y geocodificando...</div>}

          {rows.length > 0 && !parsing && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 size={14} />
                  {valid} validos
                </span>
                {invalid > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle size={14} />
                    {invalid} con errores
                  </span>
                )}
                {warnings > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <AlertCircle size={14} />
                    {warnings} advertencias
                  </span>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Cliente</th>
                      <th className="p-2 text-left font-medium">Direccion</th>
                      <th className="p-2 text-left font-medium">Peso</th>
                      <th className="p-2 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-2 text-gray-400">{i + 1}</td>
                        <td className="p-2 truncate max-w-[150px]">{r.customer_name || '-'}</td>
                        <td className="p-2 truncate max-w-[220px] text-gray-500">{r.address || '-'}</td>
                        <td className="p-2 text-gray-500">{r.total_weight_kg || '-'}</td>
                        <td className="p-2">
                          {r.error ? (
                            <span className="text-red-600">{r.error}</span>
                          ) : r.warning ? (
                            <span className="text-amber-600">{r.warning}</span>
                          ) : (
                            <span className="text-emerald-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing || valid === 0}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {importing ? 'Importando...' : `Importar ${valid} pedido${valid === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
