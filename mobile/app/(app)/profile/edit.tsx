import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, Stack } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { colors, spacing, radius } from '@/theme'

// license_expiry se guarda como ISO date (YYYY-MM-DD) en la DB.
// Mostramos / editamos en formato DD/MM/AAAA para que sea natural.
function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function displayToIso(display: string): { iso: string | null; valid: boolean } {
  const trimmed = display.trim()
  if (!trimmed) return { iso: null, valid: true }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (!match) return { iso: null, valid: false }
  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, valid: false }
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { iso: null, valid: false }
  return { iso, valid: true }
}

export default function EditProfileScreen() {
  const { driver, refreshDriver } = useAuth()

  const [firstName, setFirstName] = useState(driver?.first_name ?? '')
  const [lastName, setLastName] = useState(driver?.last_name ?? '')
  const [phone, setPhone] = useState(driver?.phone ?? '')
  const [nationalId, setNationalId] = useState(driver?.national_id ?? '')
  const [licenseNumber, setLicenseNumber] = useState(driver?.license_number ?? '')
  const [licenseExpiry, setLicenseExpiry] = useState(
    isoToDisplay(driver?.license_expiry),
  )
  const [savingProfile, setSavingProfile] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSaveProfile() {
    if (!driver) return
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    if (!trimmedFirst || !trimmedLast) {
      Alert.alert('Datos incompletos', 'Nombre y apellido son obligatorios.')
      return
    }

    const expiryParsed = displayToIso(licenseExpiry)
    if (!expiryParsed.valid) {
      Alert.alert(
        'Fecha inválida',
        'La fecha de vencimiento debe tener el formato DD/MM/AAAA.',
      )
      return
    }

    setSavingProfile(true)
    const { error } = await supabase
      .from('drivers')
      .update({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        phone: phone.trim() || null,
        national_id: nationalId.trim() || null,
        license_number: licenseNumber.trim() || null,
        license_expiry: expiryParsed.iso,
      })
      .eq('id', driver.id)

    setSavingProfile(false)

    if (error) {
      Alert.alert('No se pudo guardar', error.message)
      return
    }

    await refreshDriver()
    Alert.alert('Listo', 'Tus datos fueron actualizados.', [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert(
        'Contraseña muy corta',
        'La contraseña debe tener al menos 8 caracteres.',
      )
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('No coincide', 'Las contraseñas ingresadas no coinciden.')
      return
    }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)

    if (error) {
      Alert.alert('No se pudo cambiar la contraseña', error.message)
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    Alert.alert('Contraseña actualizada', 'Tu nueva contraseña está activa.')
  }

  if (!driver) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Editar perfil' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datos personales</Text>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Nombre"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.label}>Apellido</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Apellido"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+56 9 ..."
              placeholderTextColor={colors.textLight}
              style={styles.input}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>RUT</Text>
            <TextInput
              value={nationalId}
              onChangeText={setNationalId}
              placeholder="12.345.678-9"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.card, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionTitle}>Licencia de conducir</Text>

            <Text style={styles.label}>Número de licencia</Text>
            <TextInput
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="Clase y número"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Text style={styles.label}>Vencimiento</Text>
            <TextInput
              value={licenseExpiry}
              onChangeText={setLicenseExpiry}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              maxLength={10}
            />

            <Pressable
              onPress={handleSaveProfile}
              disabled={savingProfile}
              style={({ pressed }) => [
                styles.primaryBtn,
                savingProfile && { opacity: 0.6 },
                pressed && !savingProfile && { backgroundColor: colors.primaryDark },
              ]}
            >
              {savingProfile ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Guardar cambios</Text>
              )}
            </Pressable>
          </View>

          <View style={[styles.card, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionTitle}>Cambiar contraseña</Text>

            <Text style={styles.label}>Nueva contraseña</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
            />

            <Text style={styles.label}>Confirmar contraseña</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repite la contraseña"
              placeholderTextColor={colors.textLight}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
            />

            <Pressable
              onPress={handleChangePassword}
              disabled={savingPassword || !newPassword || !confirmPassword}
              style={({ pressed }) => [
                styles.primaryBtn,
                (savingPassword || !newPassword || !confirmPassword) && {
                  opacity: 0.55,
                },
                pressed &&
                  !savingPassword &&
                  newPassword.length > 0 && { backgroundColor: colors.primaryDark },
              ]}
            >
              {savingPassword ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Actualizar contraseña</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
})
