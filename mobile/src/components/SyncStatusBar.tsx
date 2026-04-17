import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { getPendingCount } from '@/lib/offline'
import { colors, radius, spacing } from '@/theme'

/**
 * Thin banner that shows connectivity + offline-queue state. Renders nothing
 * when online with zero pending items so it doesn't steal vertical space
 * during the happy path.
 */
export function SyncStatusBar() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected === true)
    })
    NetInfo.fetch()
      .then((state) => setOnline(state.isConnected === true))
      .catch(() => setOnline(null))
    return () => unsub()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      const n = await getPendingCount()
      if (!cancelled) setPending(n)
    }

    refresh()
    // Poll every 4s — cheap local SQLite count, enough to reflect both new
    // enqueues and successful drains without wiring a full pub/sub.
    const id = setInterval(refresh, 4000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Happy path: online, nothing queued → render nothing.
  if (online !== false && pending === 0) return null

  if (online === false) {
    return (
      <View style={[styles.bar, styles.offline]}>
        <View style={[styles.dot, { backgroundColor: colors.warning }]} />
        <Text style={styles.text}>
          Sin conexión{pending > 0 ? ` · ${pending} por sincronizar` : ''}
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.bar, styles.syncing]}>
      <View style={[styles.dot, { backgroundColor: colors.info }]} />
      <Text style={styles.text}>
        Sincronizando {pending} {pending === 1 ? 'cambio pendiente' : 'cambios pendientes'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  offline: {
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  syncing: {
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.info,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
})
