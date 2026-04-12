import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard, Package, Users, Truck, Star, Activity } from 'lucide-react'
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters'
import { DateRangeFilter } from '../components/analytics/DateRangeFilter'
import { SummaryView } from './analytics/SummaryView'
import { DeliveriesView } from './analytics/DeliveriesView'
import { DriversView } from './analytics/DriversView'
import { FleetView } from './analytics/FleetView'
import { CustomersView } from './analytics/CustomersView'
import { OperationsView } from './analytics/OperationsView'

type SectionKey = 'summary' | 'deliveries' | 'drivers' | 'fleet' | 'customers' | 'operations'

const SECTIONS: { key: SectionKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'summary', label: 'Resumen', icon: LayoutDashboard },
  { key: 'deliveries', label: 'Entregas', icon: Package },
  { key: 'drivers', label: 'Conductores', icon: Users },
  { key: 'fleet', label: 'Flota', icon: Truck },
  { key: 'customers', label: 'Clientes', icon: Star },
  { key: 'operations', label: 'Operacional', icon: Activity },
]

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { from, to, preset, previousFrom, previousTo, setPreset, setRange } = useAnalyticsFilters()

  const sectionParam = (searchParams.get('section') as SectionKey | null) ?? 'summary'
  const activeSection: SectionKey = SECTIONS.some((s) => s.key === sectionParam) ? sectionParam : 'summary'

  function setSection(key: SectionKey) {
    const next = new URLSearchParams(searchParams)
    next.set('section', key)
    setSearchParams(next, { replace: true })
  }

  const viewProps = { from, to, previousFrom, previousTo }

  function renderSection() {
    switch (activeSection) {
      case 'summary':
        return <SummaryView {...viewProps} />
      case 'deliveries':
        return <DeliveriesView {...viewProps} />
      case 'drivers':
        return <DriversView {...viewProps} />
      case 'fleet':
        return <FleetView {...viewProps} />
      case 'customers':
        return <CustomersView {...viewProps} />
      case 'operations':
        return <OperationsView {...viewProps} />
      default:
        return <SummaryView {...viewProps} />
    }
  }

  return (
    <div className="flex h-screen">
      <div className="w-56 border-r border-gray-200 bg-white p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Analiticas</h2>
        <nav className="space-y-0.5">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                activeSection === key
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <DateRangeFilter
            from={from}
            to={to}
            preset={preset}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">{renderSection()}</div>
      </div>
    </div>
  )
}
