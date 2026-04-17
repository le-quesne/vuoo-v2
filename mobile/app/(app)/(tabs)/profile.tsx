import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { DriverAvailability, Vehicle } from '@/types/database'
import { colors, spacing, radius, shadow } from '@/theme'

const AVAILABILITY_OPTIONS: { value: DriverAvailability; label: string; color: string }[] = [
  { value: 'online', label: 'En línea', color: colors.success },
  { value: 'on_break', label: 'En pausa', color: colors.warning },
  { value: 'off_shift', label: 'Fin jornada', color: colors.textMuted },
]

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatWorkingDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return '—'
  const ordered = [...days].sort((a, b) => a - b)
  return ordered
    .map((d) => DAY_LABELS[d] ?? '')
    .filter(Boolean)
    .join(', ')
}

function formatLicenseExpiry(expiry: string | null | undefined): string {
  if (!expiry) return ''
  const d = new Date(expiry)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function statusMeta(status: string | null | undefined): { label: string; color: string; bg: string } {
  switch (status) {
    case 'active':
      return { label: 'Activo', color: colors.success, bg: colors.successBg }
    case 'on_leave':
      return { label: 'En permiso', color: colors.warning, bg: colors.warningBg }
    case 'inactive':
    default:
      return { label: 'Inactivo', color: colors.textMuted, bg: colors.border }
  }
}

export default function ProfileScreen() {
  const { driver, user, signOut, refreshDriver } = useAuth()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(false)
  const [updatingAvailability, setUpdatingAvailability] = useState<DriverAvailability | null>(null)

  async function handleAvailabilityChange(next: DriverAvailability) {
    if (!driver || driver.availability === next || updatingAvailability) return
    setUpdatingAvailability(next)
    const { error } = await supabase
      .from('drivers')
      .update({ availability: next })
      .eq('id', driver.id)
    setUpdatingAvailability(null)
    if (error) {
      Alert.alert('Error', 'No se pudo actualizar tu disponibilidad.')
      return
    }
    await refreshDriver()
  }

  useEffect(() => {
    let cancelled = false
    async function loadVehicle() {
      if (!driver?.default_vehicle_id) {
        setVehicle(null)
        return
      }
      setLoadingVehicle(true)
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', driver.default_vehicle_id)
        .maybeSingle()
      if (!cancelled) {
        setVehicle((data as Vehicle | null) ?? null)
        setLoadingVehicle(false)
      }
    }
    loadVehicle()
    return () => {
      cancelled = true
    }
  }, [driver?.default_vehicle_id])

  function handleSignOut() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (!driver) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const initials =
    `${driver.first_name?.[0] ?? ''}${driver.last_name?.[0] ?? ''}`.toUpperCase() || '?'
  const fullName = `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || 'Conductor'
  const status = statusMeta(driver.status)

  const licenseLine = driver.license_number
    ? `${driver.license_number}${
        driver.license_expiry ? ` · vence ${formatLicenseExpiry(driver.license_expiry)}` : ''
      }`
    : '—'

  const vehicleLabel = !driver.default_vehicle_id
    ? '—'
    : loadingVehicle
      ? 'Cargando…'
      : vehicle
        ? `${vehicle.name}${vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}`
        : '—'

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero card navy */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.heroName}>{fullName}</Text>
          <Text style={styles.heroEmail}>{driver.email ?? user?.email ?? '—'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Availability picker */}
        <View style={styles.availabilityCard}>
          <Text style={styles.availabilityLabel}>Mi disponibilidad</Text>
          <View style={styles.availabilityRow}>
            {AVAILABILITY_OPTIONS.map((opt) => {
              const selected = driver.availability === opt.value
              const isUpdating = updatingAvailability === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => handleAvailabilityChange(opt.value)}
                  disabled={!!updatingAvailability}
                  style={({ pressed }) => [
                    styles.availabilityBtn,
                    selected && { borderColor: opt.color, backgroundColor: `${opt.color}15` },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[styles.availabilityDot, { backgroundColor: opt.color }]} />
                  {isUpdating ? (
                    <ActivityIndicator color={opt.color} size="small" />
                  ) : (
                    <Text
                      style={[
                        styles.availabilityBtnText,
                        selected && { color: opt.color, fontWeight: '700' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <InfoRow label="Teléfono" value={driver.phone ?? '—'} />
          <InfoRow label="RUT" value={driver.national_id ?? '—'} />
          <InfoRow label="Licencia" value={licenseLine} />
          <InfoRow label="Vehículo asignado" value={vehicleLabel} />
          <InfoRow
            label="Días laborales"
            value={formatWorkingDays(driver.working_days)}
            isLast
          />
        </View>

        {/* Edit profile button */}
        <Pressable
          onPress={() => router.push('/(app)/profile/edit')}
          style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.editBtnText}>Editar perfil</Text>
        </Pressable>

        {/* Sign out button */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>

        <Text style={styles.footer}>Vuoo v0.0.1</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function InfoRow({
  label,
  value,
  isLast,
}: {
  label: string
  value: string
  isLast?: boolean
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero
  hero: {
    backgroundColor: colors.navy900,
    padding: spacing.xl,
    borderRadius: radius.xl,
    alignItems: 'center',
    ...shadow.elevated,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.navy700,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  heroEmail: {
    fontSize: 14,
    color: '#cbd5e1', // slate-300
    marginTop: 4,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Availability picker
  availabilityCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  availabilityLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.md,
  },
  availabilityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  availabilityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  availabilityBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Info card
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  infoRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },

  // Edit
  editBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  editBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Sign out
  signOutBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },

  footer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textLight,
  },
})
