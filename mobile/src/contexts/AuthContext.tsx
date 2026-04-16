import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { registerForPushNotifications } from '../lib/notifications'
import type { Driver } from '../types/database'

interface AuthContextValue {
  user: User | null
  driver: Driver | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshDriver: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  driver: null,
  loading: true,
  signIn: async () => ({ error: 'not ready' }),
  signOut: async () => {},
  refreshDriver: async () => {},
})

async function fetchDriver(userId: string): Promise<Driver | null> {
  const { data } = await supabase
    .from('drivers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as Driver | null) ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      userRef.current = u
      setUser(u)
      if (!u) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED') return
        const u = session?.user ?? null
        const prevId = userRef.current?.id
        userRef.current = u

        if (!u) {
          setUser(null)
          setDriver(null)
          setLoading(false)
        } else if (u.id !== prevId) {
          setUser(u)
          setLoading(true)
        }
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchDriver(user.id).then((d) => {
      if (cancelled) return
      setDriver(d)
      setLoading(false)
      // Registro de push token no bloqueante: cualquier error se loguea silencioso
      registerForPushNotifications(user.id).catch((err) => {
        console.warn('[AuthContext] registerForPushNotifications failed', err)
      })
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshDriver = useCallback(async () => {
    const u = userRef.current
    if (!u) return
    const d = await fetchDriver(u.id)
    setDriver(d)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, driver, loading, signIn, signOut, refreshDriver }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
