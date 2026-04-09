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
const AUTH_TIMEOUT_MS = 3000

async function fetchMemberships(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organization:organizations(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('[AuthContext] fetchMemberships error:', error)
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

// Read session from localStorage directly — bypasses supabase-js locks entirely
function getStoredUser(): User | null {
  try {
    const storageKey = `sb-iywjnoojchdcjswmikxg-auth-token`
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const session = JSON.parse(raw)
    return session?.user ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null)
  const [orgMemberships, setOrgMemberships] = useState<MembershipRow[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)
  const resolvedRef = useRef(false)

  // Step 1: Listen for auth changes — NO API calls here (auth-js #762 deadlock)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED') return

        resolvedRef.current = true
        const u = session?.user ?? null
        userRef.current = u
        setIsSuperAdmin(u?.app_metadata?.is_super_admin === true)

        if (!u) {
          setUser(null)
          setOrgMemberships([])
          setCurrentOrgState(null)
          setLoading(false)
        } else {
          setLoading(true)
          setUser(u)
        }
      },
    )

    // Safety net: if onAuthStateChange never fires (auth-js lock deadlock),
    // fall back to reading the session directly from localStorage
    const timeout = setTimeout(() => {
      if (resolvedRef.current) return

      const storedUser = getStoredUser()
      userRef.current = storedUser
      if (storedUser) {
        setIsSuperAdmin(storedUser.app_metadata?.is_super_admin === true)
        setUser(storedUser)
        // loading stays true — useEffect[user?.id] will handle it
      } else {
        setLoading(false)
      }
    }, AUTH_TIMEOUT_MS)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  // Step 2: Load memberships whenever user changes — OUTSIDE the auth lock
  // setTimeout(0) ensures supabase-js internal lock is fully released (auth-js #762)
  useEffect(() => {
    if (!user) return

    let cancelled = false
    setLoading(true)

    const timer = setTimeout(() => {
      fetchMemberships(user.id).then((memberships) => {
        if (cancelled) return
        const org = pickOrg(memberships)
        setOrgMemberships(memberships)
        setCurrentOrgState(org)
        setLoading(false)
      })
    }, 0)

    return () => {
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
