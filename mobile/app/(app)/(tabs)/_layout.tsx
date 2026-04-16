import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import VuooLogo from '@/components/VuooLogo'
import { colors } from '@/theme'

function TabBarIcon({ label, focused }: { label: string; focused: boolean }) {
  const color = focused ? colors.primary : colors.textMuted
  return (
    <View style={styles.iconWrap}>
      {label === 'rutas' && <RoutesGlyph color={color} />}
      {label === 'historial' && <HistoryGlyph color={color} />}
      {label === 'perfil' && <ProfileGlyph color={color} />}
    </View>
  )
}

function RoutesGlyph({ color }: { color: string }) {
  return (
    <View style={[styles.glyphBase, { borderColor: color }]}>
      <View style={[styles.glyphLineTop, { backgroundColor: color }]} />
      <View style={[styles.glyphLineBottom, { backgroundColor: color }]} />
    </View>
  )
}

function HistoryGlyph({ color }: { color: string }) {
  return (
    <View style={[styles.glyphCircle, { borderColor: color }]}>
      <View style={[styles.glyphHand1, { backgroundColor: color }]} />
      <View style={[styles.glyphHand2, { backgroundColor: color }]} />
    </View>
  )
}

function ProfileGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyphPerson}>
      <View style={[styles.glyphHead, { borderColor: color }]} />
      <View style={[styles.glyphBody, { borderColor: color }]} />
    </View>
  )
}

function BrandHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <VuooLogo size={44} color="#ffffff" />
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  )
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  // Respetamos el home indicator pero eliminamos el padding extra muerto:
  // la zona clicable va justo encima del safe area y los iconos quedan
  // centrados en esos ~52 px.
  const bottomInset = Math.max(insets.bottom - 4, 6)
  const tabBarHeight = 52 + bottomInset

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        headerStyle: { backgroundColor: colors.navy950 },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rutas',
          tabBarIcon: ({ focused }) => <TabBarIcon label="rutas" focused={focused} />,
          headerTitle: () => <BrandHeader title="Mis rutas" />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: ({ focused }) => <TabBarIcon label="historial" focused={focused} />,
          headerTitle: () => <BrandHeader title="Historial" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <TabBarIcon label="perfil" focused={focused} />,
          headerTitle: () => <BrandHeader title="Perfil" />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphBase: {
    width: 20,
    height: 14,
    borderWidth: 2,
    borderRadius: 3,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  glyphLineTop: { height: 1.5, width: '60%', alignSelf: 'flex-start', marginLeft: 2 },
  glyphLineBottom: { height: 1.5, width: '60%', alignSelf: 'flex-end', marginRight: 2 },
  glyphCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphHand1: {
    position: 'absolute',
    width: 1.5,
    height: 6,
    top: 3,
    left: 8.25,
    borderRadius: 1,
  },
  glyphHand2: {
    position: 'absolute',
    width: 6,
    height: 1.5,
    top: 8.25,
    left: 8.25,
    borderRadius: 1,
  },
  glyphPerson: { width: 20, height: 20, alignItems: 'center' },
  glyphHead: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    marginTop: 1,
  },
  glyphBody: {
    position: 'absolute',
    bottom: 1,
    width: 16,
    height: 7,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 2,
    borderBottomWidth: 0,
  },
})
