import { useNavigate } from 'react-router-dom'

type PlannerView = 'day' | 'week' | 'month'

const options: { key: PlannerView; label: string; path: string }[] = [
  { key: 'day', label: 'Dia', path: '/planner' },
  { key: 'week', label: 'Semana', path: '/planner/week' },
  { key: 'month', label: 'Mes', path: '/planner/calendar' },
]

export function PlannerViewToggle({ active }: { active: PlannerView }) {
  const navigate = useNavigate()
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5">
      {options.map((opt) => {
        const isActive = opt.key === active
        return (
          <button
            key={opt.key}
            onClick={() => navigate(opt.path)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
