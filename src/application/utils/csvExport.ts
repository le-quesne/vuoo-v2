export function exportToCSV(
  filename: string,
  rows: Record<string, unknown>[],
  headers?: Record<string, string>,
) {
  if (rows.length === 0) {
    const blob = new Blob([''], { type: 'text/csv;charset=utf-8;' })
    triggerDownload(blob, filename)
    return
  }

  const keys = headers ? Object.keys(headers) : Object.keys(rows[0])
  const headerRow = headers ? Object.values(headers) : keys

  const escape = (val: unknown): string => {
    if (val == null) return ''
    const str = typeof val === 'string' ? val : String(val)
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
  }

  const csv = [
    headerRow.map(escape).join(','),
    ...rows.map((row) => keys.map((k) => escape(row[k])).join(',')),
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
