import { useEffect, useMemo, useState } from 'react'
import { Download, Truck, Route as RouteIcon, DollarSign, Fuel } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { KPICard } from '@/presentation/features/analytics/components/KPICard'
import { ChartCard } from '@/presentation/features/analytics/components/ChartCard'
import { formatNumber, formatDistance, formatCurrency } from '@/presentation/features/analytics/utils/analyticsFormat'
import { exportToCSV } from '@/application/utils/csvExport'

const FUEL_PRICE_CLP = 1200

interface Props {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

interface RouteRow {
  id: string
  total_distance_km: number | null
  total_duration_minutes: number | null
  vehicle: {
    id: string
    name: string
    license_plate: string | null
    price_per_km: number | null
    price_per_hour: number | null
    avg_consumption: number | null
    capacity_weight_kg: number | null
  } | null
  plan: { date: string } | null
}

interface VehicleAggregate {
  id: string
  name: string
  license_plate: string | null
  routes: number
  distance_km: number
  duration_min: number
  price_per_km: number
  price_per_hour: number
  avg_consumption: number
  cost_km: number
  cost_hour: number
  total_cost: number
  fuel_liters: number
  fuel_cost: number
}

export function FleetView({ from, to }: Props) {
  const { currentOrg } = useAuth()
  const [rows, setRows] = useState<RouteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrg?.id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('routes')
      .select(
        'id, total_distance_km, total_duration_minutes, vehicle:vehicles(id, name, license_plate, price_per_km, price_per_hour, avg_consumption, capacity_weight_kg), plan:plans!inner(date)',
      )
      .eq('org_id', currentOrg.id)
      .gte('plan.date', from)
      .lte('plan.date', to)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        else setRows((data as unknown as RouteRow[]) ?? [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  const aggregates = useMemo<VehicleAggregate[]>(() => {
    const map = new Map<string, VehicleAggregate>()
    for (const r of rows) {
      const v = r.vehicle
      if (!v) continue
      const distance = Number(r.total_distance_km ?? 0)
      const durationMin = Number(r.total_duration_minutes ?? 0)
      const pricePerKm = Number(v.price_per_km ?? 0)
      const pricePerHour = Number(v.price_per_hour ?? 0)
      const avgConsumption = Number(v.avg_consumption ?? 0)

      const costKm = distance * pricePerKm
      const costHour = (durationMin / 60) * pricePerHour
      const totalCost = costKm + costHour
      const fuelLiters = avgConsumption > 0 ? (distance / 100) * avgConsumption : 0
      const fuelCost = fuelLiters * FUEL_PRICE_CLP

      const existing = map.get(v.id)
      if (existing) {
        existing.routes += 1
        existing.distance_km += distance
        existing.duration_min += durationMin
        existing.cost_km += costKm
        existing.cost_hour += costHour
        existing.total_cost += totalCost
        existing.fuel_liters += fuelLiters
        existing.fuel_cost += fuelCost
      } else {
        map.set(v.id, {
          id: v.id,
          name: v.name,
          license_plate: v.license_plate,
          routes: 1,
          distance_km: distance,
          duration_min: durationMin,
          price_per_km: pricePerKm,
          price_per_hour: pricePerHour,
          avg_consumption: avgConsumption,
          cost_km: costKm,
          cost_hour: costHour,
          total_cost: totalCost,
          fuel_liters: fuelLiters,
          fuel_cost: fuelCost,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.distance_km - a.distance_km)
  }, [rows])

  const totals = useMemo(() => {
    return aggregates.reduce(
      (acc, v) => ({
        vehicles: acc.vehicles + 1,
        distance: acc.distance + v.distance_km,
        cost: acc.cost + v.total_cost,
        fuelLiters: acc.fuelLiters + v.fuel_liters,
        fuelCost: acc.fuelCost + v.fuel_cost,
      }),
      { vehicles: 0, distance: 0, cost: 0, fuelLiters: 0, fuelCost: 0 },
    )
  }, [aggregates])

  function handleExport() {
    exportToCSV(
      `flota_${from}_${to}.csv`,
      aggregates.map((v) => ({
        vehicle: v.name,
        plate: v.license_plate ?? '',
        routes: v.routes,
        distance_km: v.distance_km.toFixed(1),
        cost_per_km: v.price_per_km,
        total_cost: Math.round(v.total_cost),
        fuel_liters: v.fuel_liters.toFixed(1),
        fuel_cost: Math.round(v.fuel_cost),
      })),
      {
        vehicle: 'Vehiculo',
        plate: 'Matricula',
        routes: 'Rutas',
        distance_km: 'Distancia km',
        cost_per_km: 'Costo/km',
        total_cost: 'Costo total CLP',
        fuel_liters: 'Combustible L',
        fuel_cost: 'Combustible CLP',
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Flota</h2>
          <p className="text-sm text-gray-500 mt-1">Uso de vehiculos y costos estimados</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded border border-gray-200 bg-white"
        >
          <Download size={12} />
          Exportar CSV
        </button>
      </div>

      {error && <div className="text-sm text-red-500">Error: {error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Vehiculos activos" value={formatNumber(totals.vehicles)} icon={<Truck size={18} />} />
        <KPICard label="Distancia total" value={formatDistance(totals.distance)} icon={<RouteIcon size={18} />} />
        <KPICard
          label="Costo estimado total"
          value={formatCurrency(totals.cost)}
          icon={<DollarSign size={18} />}
          hint="km + horas"
        />
        <KPICard
          label="Combustible estimado"
          value={formatCurrency(totals.fuelCost)}
          icon={<Fuel size={18} />}
          hint={`${formatNumber(totals.fuelLiters, 0)} L @ ${formatCurrency(FUEL_PRICE_CLP)}/L`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Distancia por vehiculo" subtitle="Kilometros recorridos">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : aggregates.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aggregates}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip formatter={((v: number) => `${v.toFixed(1)} km`) as never} />
                <Bar dataKey="distance_km" name="Distancia" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Costo estimado por vehiculo" subtitle="km + horas operativas">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : aggregates.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aggregates}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
                <Bar dataKey="total_cost" name="Costo" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Detalle por vehiculo" subtitle="Costos y consumo">
        {loading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Cargando...</div>
        ) : aggregates.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Sin datos en el periodo</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="p-2 font-medium">Vehiculo</th>
                  <th className="p-2 font-medium">Matricula</th>
                  <th className="p-2 font-medium text-right">Rutas</th>
                  <th className="p-2 font-medium text-right">Distancia</th>
                  <th className="p-2 font-medium text-right">Costo/km</th>
                  <th className="p-2 font-medium text-right">Costo total</th>
                  <th className="p-2 font-medium text-right">Combustible</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((v) => (
                  <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="p-2 font-medium">{v.name}</td>
                    <td className="p-2 text-gray-500">{v.license_plate ?? '-'}</td>
                    <td className="p-2 text-right">{v.routes}</td>
                    <td className="p-2 text-right">{formatDistance(v.distance_km)}</td>
                    <td className="p-2 text-right text-gray-600">{formatCurrency(v.price_per_km)}</td>
                    <td className="p-2 text-right font-medium">{formatCurrency(v.total_cost)}</td>
                    <td className="p-2 text-right text-gray-600">
                      {v.avg_consumption > 0 ? formatCurrency(v.fuel_cost) : <span className="text-gray-300">N/A</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
