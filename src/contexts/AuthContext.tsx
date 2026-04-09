import { createContext, useEffect, useState, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Organization, OrganizationMember, OrgRole } from '../types/database'

type MembershipRow = OrganizationMember & { organization: Organization }

export interface AuthContextValue {
  user: User | null
  currentOrg: Organization | null
  orgMemberships: MembershipRow[]
  orgRole: OrgRole | null
  isSuperAdmin: boolean
  loading: boolean
  setCurrentOrg: (org: Organization) => void
  refreshMemberships: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  currentOrg: null,
  orgMemberships: [],
  orgRole: null,
  isSuperAdmin: false,
  loading: true,
  setCurrentOrg: () => {},
  refreshMemberships: async () => {},
  signOut: async () => {},
})

const ORG_STORAGE_KEY = 'vuoo_current_org_id'

async function fetchMemberships(userId: string): Promise<MembershipRow[]> {
  console.log('[AUTH] fetchMemberships START for', userId)
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organization:organizations(*)')
    .eq('user_id', userId)

  console.log('[AUTH] fetchMemberships DONE:', { count: data?.length, error })

  if (error) {
    console.error('[AUTH] fetchMemberships error:', error)
    return []
  }

  return (data ?? []) as unknown as MembershipRow[]
}

function pickOrg(memberships: MembershipRow[]): Organization | null {
  if (memberships.length === 0) return null

  const savedOrgId = localStorage.getItem(ORG_STORAGE_KEY)
  const saved = memberships.find((m) => m.org_id === savedOrgId)

  if (saved) return saved.organization

  const first = memberships[0].organization
  localStorage.setItem(ORG_STORAGE_KEY, memberships[0].org_id)
  return first
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null)
  const [orgMemberships, setOrgMemberships] = useState<MembershipRow[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)

  console.log('[AUTH] render:', { user: user?.id?.slice(0,8), currentOrg: currentOrg?.name, loading, memberships: orgMemberships.length })

  // Step 1: Listen for auth changes — NO API calls here (auth-js #762)
  useEffect(() => {
    console.log('[AUTH] useEffect[onAuthStateChange] mounted')

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[AUTH] onAuthStateChange:', event, { hasSession: !!session, userId: session?.user?.id?.slice(0,8) })

        if (event === 'TOKEN_REFRESHED') return

        const u = session?.user ?? null
        userRef.current = u
        setIsSuperAdmin(u?.app_metadata?.is_super_admin === true)

        if (!u) {
          console.log('[AUTH] no user, clearing state')
          setUser(null)
          setOrgMemberships([])
          setCurrentOrgState(null)
          setLoading(false)
        } else {
          console.log('[AUTH] user found, setting loading=true + user')
          setLoading(true)
          setUser(u)
        }
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  // Step 2: Load memberships — OUTSIDE auth lock
  useEffect(() => {
    console.log('[AUTH] useEffect[user?.id]:', user?.id?.slice(0,8) ?? 'null')
    if (!user) return

    let cancelled = false
    setLoading(true)

    const timer = setTimeout(() => {
      console.log('[AUTH] setTimeout fired, calling fetchMemberships')
      fetchMemberships(user.id).then((memberships) => {
        console.log('[AUTH] fetchMemberships resolved:', { cancelled, count: memberships.length })
        if (cancelled) return
        const org = pickOrg(memberships)
        console.log('[AUTH] setting state:', { org: org?.name, loading: false })
        setOrgMemberships(memberships)
        setCurrentOrgState(org)
        setLoading(false)
      })
    }, 0)

    return () => {
      console.log('[AUTH] useEffect[user?.id] cleanup')
      cancelled = true
      clearTimeout(timer)
    }
  }, [user?.id])

  const setCurrentOrg = useCallback((org: Organization) => {
    localStorage.setItem(ORG_STORAGE_KEY, org.id)
    setCurrentOrgState(org)
  }, [])

  const refreshMemberships = useCallback(async () => {
    const u = userRef.current
    if (!u) return
    const memberships = await fetchMemberships(u.id)
    const org = pickOrg(memberships)
    setOrgMemberships(memberships)
    setCurrentOrgState(org)
  }, [])

  const signOut = useCallback(async () => {
    localStorage.removeItem(ORG_STORAGE_KEY)
    await supabase.auth.signOut()
  }, [])

  const orgRole =
    orgMemberships.find((m) => m.org_id === currentOrg?.id)?.role ?? null

  return (
    <AuthContext.Provider
      value={{
        user,
        currentOrg,
        orgMemberships,
        orgRole,
        isSuperAdmin,
        loading,
        setCurrentOrg,
        refreshMemberships,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
