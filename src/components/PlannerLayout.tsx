import { Outlet, useLocation } from 'react-router-dom'
import { PlannerViewToggle } from './PlannerViewToggle'

export function PlannerLayout() {
  const { pathname } = useLocation()
  const active = pathname.startsWith('/planner/week')
    ? 'week'
    : pathname.startsWith('/planner/calendar')
    ? 'month'
    : 'day'

  return (
    <div className="min-h-screen">
      <div className="flex justify-end px-6 pt-6">
        <PlannerViewToggle active={active} />
      </div>
      <Outlet />
    </div>
  )
}
