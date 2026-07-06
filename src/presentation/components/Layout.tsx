import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/application/hooks/useAuth'
import { Sidebar } from './Sidebar'

const SIDEBAR_STORAGE_KEY = 'vuoo_sidebar_expanded'

function readSidebarExpanded(): boolean {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

export function Layout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarExpanded)
  const { currentOrg } = useAuth()

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarExpanded))
    } catch {
      // localStorage no disponible; el estado sigue en memoria.
    }
  }, [sidebarExpanded])

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((v) => !v)} />
      <main className={`flex-1 transition-all duration-200 ${sidebarExpanded ? 'ml-48' : 'ml-16'}`}>
        {/* Remontar el contenido al cambiar de org fuerza a cada página a
            re-fetchear con la nueva org (refresco instantáneo del switcher). */}
        <div key={currentOrg?.id ?? 'no-org'} className="contents">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
