import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded(!sidebarExpanded)} />
      <main className={`flex-1 transition-all duration-200 ${sidebarExpanded ? 'ml-48' : 'ml-16'}`}>
        <Outlet />
      </main>
    </div>
  )
}
