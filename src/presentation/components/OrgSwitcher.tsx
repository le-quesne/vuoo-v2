import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import type { Organization } from '@/data/types/database'

export function OrgSwitcher({ expanded }: { expanded: boolean }) {
  const { currentOrg, orgMemberships, isSuperAdmin, setCurrentOrg } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [allOrgs, setAllOrgs] = useState<Organization[]>([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Orgs disponibles: super admin ve todas; el resto, sus membresías.
  const orgs = useMemo<Organization[]>(() => {
    if (isSuperAdmin) return allOrgs
    return orgMemberships.map((m) => m.organization)
  }, [isSuperAdmin, allOrgs, orgMemberships])

  const canSwitch = isSuperAdmin || orgMemberships.length > 1

  // Cargar todas las orgs (solo super admin) la primera vez que se abre.
  async function loadAllOrgs() {
    if (allOrgs.length > 0 || loadingOrgs) return
    setLoadingOrgs(true)
    const { data } = await supabase.from('organizations').select('*').order('name')
    if (data) setAllOrgs(data as Organization[])
    setLoadingOrgs(false)
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next && isSuperAdmin) void loadAllOrgs()
  }

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!currentOrg) return null

  const filtered = query.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
    : orgs

  function handleSelect(org: Organization) {
    setOpen(false)
    setQuery('')
    if (org.id !== currentOrg?.id) setCurrentOrg(org)
  }

  // Sin opciones para cambiar: label plano (comportamiento previo).
  if (!canSwitch) {
    return (
      <span
        className={`text-slate-400 mb-4 truncate text-center ${
          expanded ? 'text-sm font-medium' : 'text-[9px] max-w-[56px]'
        }`}
        title={currentOrg.name}
      >
        {currentOrg.name}
      </span>
    )
  }

  return (
    <div ref={containerRef} className="relative mb-4">
      <button
        type="button"
        onClick={handleToggle}
        title={currentOrg.name}
        className={`flex items-center rounded-lg text-slate-200 hover:bg-navy-800 transition-colors ${
          expanded
            ? 'w-full px-2 py-1.5 gap-1 justify-between'
            : 'w-full justify-center px-1 py-1'
        }`}
      >
        <span
          className={`truncate ${expanded ? 'text-sm font-medium' : 'text-[9px] max-w-[52px] text-center'}`}
        >
          {currentOrg.name}
        </span>
        <ChevronDown size={expanded ? 14 : 10} className="shrink-0 text-slate-500" />
      </button>

      {open && (
        <div
          className={`absolute z-[70] mt-1 rounded-lg bg-navy-900 border border-navy-800 shadow-xl overflow-hidden ${
            expanded ? 'left-0 right-0' : 'left-full ml-2 top-0 w-56'
          }`}
        >
          {isSuperAdmin && orgs.length > 6 && (
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-navy-800">
              <Search size={13} className="text-slate-500 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar organización"
                className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto py-1">
            {loadingOrgs && (
              <div className="px-3 py-2 text-xs text-slate-500">Cargando…</div>
            )}
            {!loadingOrgs && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>
            )}
            {filtered.map((org) => {
              const active = org.id === currentOrg.id
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelect(org)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    active ? 'text-blue-400 bg-blue-500/10' : 'text-slate-300 hover:bg-navy-800'
                  }`}
                >
                  <span className="truncate flex-1">{org.name}</span>
                  {org.is_demo && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium shrink-0">
                      DEMO
                    </span>
                  )}
                  {active && <Check size={13} className="shrink-0" />}
                </button>
              )
            })}
          </div>

          {isSuperAdmin && (
            <div className="px-3 py-1.5 border-t border-navy-800 text-[10px] text-slate-500">
              Super admin · {orgs.length} organizaciones
            </div>
          )}
        </div>
      )}
    </div>
  )
}
