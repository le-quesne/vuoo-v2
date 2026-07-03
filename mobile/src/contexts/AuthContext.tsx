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
  driverError: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshDriver: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  driver: null,
  driverError: false,
  loading: true,
  signIn: async () => ({ error: 'not ready' }),
  signOut: async () => {},
  refreshDriver: async () => {},
})

const DRIVER_FETCH_TIMEOUT_MS = 12000

// Devuelve el driver del usuario. Usa limit(1) en vez de maybeSingle() porque
// un usuario puede tener más de una fila de driver (p. ej. en varias orgs) y
// maybeSingle() lanza error con múltiples filas, dejando la app colgada en el
// spinner de carga. Incluye timeout para no esperar indefinidamente si la red
// cuelga, y reporta si hubo error para que la UI pueda ofrecer reintentar.
async function fetchDriver(
  userId: string,
): Promise<{ driver: Driver | null; error: boolean }> {
  try {
    const query = supabase
      .from('drivers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('driver fetch timeout')),
        DRIVER_FETCH_TIMEOUT_MS,
      ),
    )

    const res = (await Promise.race([query, timeout])) as {
      data: Driver[] | null
      error: unknown
    }
    if (res.error) return { driver: null, error: true }
    return { driver: res.data?.[0] ?? null, error: false }
  } catch {
    return { driver: null, error: true }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [driverError, setDriverError] = useState(false)
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
    setDriverError(false)
    fetchDriver(user.id).then(({ driver: d, error }) => {
      if (cancelled) return
      setDriver(d)
      setDriverError(error)
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
    setDriverError(false)
    const { driver: d, error } = await fetchDriver(u.id)
    setDriver(d)
    setDriverError(error)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, driver, driverError, loading, signIn, signOut, refreshDriver }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
