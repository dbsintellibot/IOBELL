export interface ReportColumn<T> {
  key: keyof T | string
  header: string
  formatter?: (val: unknown, row: T) => string
}

export interface ReportFilter {
  id: string
  label: string
  type: 'select' | 'dateRange' | 'text'
  options?: { label: string; value: string }[]
}

export interface ReportSpec<T> {
  id: string
  title: string
  description: string
  filters: ReportFilter[]
  columns: ReportColumn<T>[]
  fetchData: (filters: Record<string, unknown>) => Promise<T[]>
}

export function exportToCSV<T>(filename: string, columns: ReportColumn<T>[], data: T[]): void {
  const headers = columns.map((col) => `"${col.header.replace(/"/g, '""')}"`).join(',')

  const rows = data.map((row) => {
    return columns
      .map((col) => {
        let val: unknown
        if (typeof col.key === 'string' && col.key.includes('.')) {
          val = col.key.split('.').reduce((acc: unknown, part) => (acc as Record<string, unknown>)?.[part], row)
        } else {
          val = (row as Record<string, unknown>)[col.key as string]
        }

        const formatted = col.formatter ? col.formatter(val, row) : String(val ?? '')
        return `"${formatted.replace(/"/g, '""')}"`
      })
      .join(',')
  })

  const csvContent = [headers, ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function triggerPrint(): void {
  window.print()
}
