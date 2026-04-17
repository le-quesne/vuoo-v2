import { useState, useEffect } from 'react'
import {
  Bell,
  MessageSquare,
  Mail,
  Phone,
  Palette,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  Loader2,
  Send,
  Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface NotificationSettings {
  // Channels
  whatsapp_enabled: boolean
  email_enabled: boolean
  sms_enabled: boolean

  // WhatsApp
  whatsapp_phone_number_id: string
  whatsapp_access_token: string
  whatsapp_verified: boolean

  // Email
  resend_api_key: string
  email_from_address: string
  email_from_name: string

  // SMS
  twilio_account_sid: string
  twilio_auth_token: string
  twilio_phone_number: string

  // Events
  notify_on_scheduled: boolean
  notify_on_transit: boolean
  notify_on_arriving: boolean
  notify_on_delivered: boolean
  notify_on_failed: boolean
  send_survey: boolean
  survey_delay_minutes: number

  // Customization
  logo_url: string
  primary_color: string
  arriving_threshold_stops: number
}

const DEFAULT_SETTINGS: NotificationSettings = {
  whatsapp_enabled: false,
  email_enabled: false,
  sms_enabled: false,
  whatsapp_phone_number_id: '',
  whatsapp_access_token: '',
  whatsapp_verified: false,
  resend_api_key: '',
  email_from_address: '',
  email_from_name: '',
  twilio_account_sid: '',
  twilio_auth_token: '',
  twilio_phone_number: '',
  notify_on_scheduled: true,
  notify_on_transit: true,
  notify_on_arriving: true,
  notify_on_delivered: true,
  notify_on_failed: true,
  send_survey: false,
  survey_delay_minutes: 30,
  logo_url: '',
  primary_color: '#6366f1',
  arriving_threshold_stops: 3,
}

const SECTIONS = [
  { id: 'channels', label: 'Canales', icon: Zap },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: Phone },
  { id: 'events', label: 'Eventos', icon: Bell },
  { id: 'customization', label: 'Personalizacion', icon: Palette },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export function NotificationSettingsPage() {
  const { currentOrg } = useAuth()
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS)
  const [activeSection, setActiveSection] = useState<SectionId>('channels')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showWhatsappToken, setShowWhatsappToken] = useState(false)
  const [showResendKey, setShowResendKey] = useState(false)
  const [showTwilioToken, setShowTwilioToken] = useState(false)
  const [testingWhatsapp, setTestingWhatsapp] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testingSms, setTestingSms] = useState(false)

  useEffect(() => {
    if (currentOrg) loadSettings()
  }, [currentOrg])

  async function loadSettings() {
    if (!currentOrg) return
    setLoading(true)
    const { data } = await supabase
      .from('org_notification_settings')
      .select('*')
      .eq('org_id', currentOrg.id)
      .single()
    if (data) {
      setSettings({ ...DEFAULT_SETTINGS, ...data })
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!currentOrg) return
    setSaving(true)
    setSaved(false)
    const { whatsapp_verified: _wv, ...rest } = settings
    await supabase
      .from('org_notification_settings')
      .upsert({ org_id: currentOrg.id, ...rest }, { onConflict: 'org_id' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function testWhatsapp() {
    setTestingWhatsapp(true)
    // Placeholder: call edge function or API to verify WhatsApp connection
    await new Promise((r) => setTimeout(r, 1500))
    setTestingWhatsapp(false)
    setSettings({ ...settings, whatsapp_verified: true })
  }

  async function testEmail() {
    setTestingEmail(true)
    await new Promise((r) => setTimeout(r, 1500))
    setTestingEmail(false)
  }

  async function testSms() {
    setTestingSms(true)
    await new Promise((r) => setTimeout(r, 1500))
    setTestingSms(false)
  }

  function update<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setSettings({ ...settings, [key]: value })
  }

  // Determine visible sections based on channel toggles
  const visibleSections = SECTIONS.filter((s) => {
    if (s.id === 'whatsapp') return settings.whatsapp_enabled
    if (s.id === 'email') return settings.email_enabled
    if (s.id === 'sms') return settings.sms_enabled
    return true
  })

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configura los canales y eventos de notificacion para tus entregas
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <CheckCircle size={16} />
          ) : (
            <Save size={16} />
          )}
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-lg p-1 overflow-x-auto">
        {visibleSections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeSection === id
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="max-w-2xl">
        {activeSection === 'channels' && (
          <SectionCard
            title="Canales de notificacion"
            description="Activa los canales por los que quieres enviar notificaciones a tus clientes."
          >
            <div className="space-y-4">
              <Toggle
                label="WhatsApp"
                description="Envia notificaciones por WhatsApp Business API"
                icon={<MessageSquare size={18} className="text-green-600" />}
                checked={settings.whatsapp_enabled}
                onChange={(v) => update('whatsapp_enabled', v)}
              />
              <Toggle
                label="Email"
                description="Envia notificaciones por correo electronico"
                icon={<Mail size={18} className="text-blue-600" />}
                checked={settings.email_enabled}
                onChange={(v) => update('email_enabled', v)}
              />
              <Toggle
                label="SMS"
                description="Envia notificaciones por mensaje de texto"
                icon={<Phone size={18} className="text-purple-600" />}
                checked={settings.sms_enabled}
                onChange={(v) => update('sms_enabled', v)}
              />
            </div>
          </SectionCard>
        )}

        {activeSection === 'whatsapp' && settings.whatsapp_enabled && (
          <SectionCard
            title="Configuracion WhatsApp"
            description="Conecta tu cuenta de WhatsApp Business API para enviar notificaciones."
          >
            <div className="space-y-3">
              <Field
                label="Phone Number ID"
                value={settings.whatsapp_phone_number_id}
                onChange={(v) => update('whatsapp_phone_number_id', v)}
                placeholder="Ej: 100234567890123"
              />
              <PasswordField
                label="Access Token"
                value={settings.whatsapp_access_token}
                onChange={(v) => update('whatsapp_access_token', v)}
                show={showWhatsappToken}
                onToggle={() => setShowWhatsappToken(!showWhatsappToken)}
                placeholder="EAAx..."
              />
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={testWhatsapp}
                  disabled={testingWhatsapp || !settings.whatsapp_phone_number_id || !settings.whatsapp_access_token}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingWhatsapp ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Verificar conexion
                </button>
                {settings.whatsapp_verified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    <CheckCircle size={12} />
                    Verificado
                  </span>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {activeSection === 'email' && settings.email_enabled && (
          <SectionCard
            title="Configuracion Email"
            description="Configura Resend para enviar correos transaccionales a tus clientes."
          >
            <div className="space-y-3">
              <PasswordField
                label="Resend API Key"
                value={settings.resend_api_key}
                onChange={(v) => update('resend_api_key', v)}
                show={showResendKey}
                onToggle={() => setShowResendKey(!showResendKey)}
                placeholder="re_..."
              />
              <Field
                label="Email remitente"
                value={settings.email_from_address}
                onChange={(v) => update('email_from_address', v)}
                placeholder="entregas@miempresa.cl"
              />
              <Field
                label="Nombre remitente"
                value={settings.email_from_name}
                onChange={(v) => update('email_from_name', v)}
                placeholder="Mi Empresa Entregas"
              />
              <div className="pt-2">
                <button
                  onClick={testEmail}
                  disabled={testingEmail || !settings.resend_api_key || !settings.email_from_address}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingEmail ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Enviar prueba
                </button>
              </div>
            </div>
          </SectionCard>
        )}

        {activeSection === 'sms' && settings.sms_enabled && (
          <SectionCard
            title="Configuracion SMS"
            description="Conecta tu cuenta de Twilio para enviar mensajes de texto."
          >
            <div className="space-y-3">
              <Field
                label="Twilio Account SID"
                value={settings.twilio_account_sid}
                onChange={(v) => update('twilio_account_sid', v)}
                placeholder="AC..."
              />
              <PasswordField
                label="Twilio Auth Token"
                value={settings.twilio_auth_token}
                onChange={(v) => update('twilio_auth_token', v)}
                show={showTwilioToken}
                onToggle={() => setShowTwilioToken(!showTwilioToken)}
                placeholder="Token de autenticacion"
              />
              <Field
                label="Twilio Phone Number"
                value={settings.twilio_phone_number}
                onChange={(v) => update('twilio_phone_number', v)}
                placeholder="+56912345678"
              />
              <div className="pt-2">
                <button
                  onClick={testSms}
                  disabled={testingSms || !settings.twilio_account_sid || !settings.twilio_auth_token}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingSms ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Enviar prueba
                </button>
              </div>
            </div>
          </SectionCard>
        )}

        {activeSection === 'events' && (
          <SectionCard
            title="Eventos de notificacion"
            description="Selecciona que eventos disparan notificaciones automaticas."
          >
            <div className="space-y-4">
              <Toggle
                label="Entrega programada"
                description="Notifica cuando una entrega es programada"
                checked={settings.notify_on_scheduled}
                onChange={(v) => update('notify_on_scheduled', v)}
              />
              <Toggle
                label="En camino"
                description="Notifica cuando el conductor sale a ruta"
                checked={settings.notify_on_transit}
                onChange={(v) => update('notify_on_transit', v)}
              />
              <Toggle
                label="Llegando"
                description="Notifica cuando el conductor esta cerca del destino"
                checked={settings.notify_on_arriving}
                onChange={(v) => update('notify_on_arriving', v)}
              />
              <Toggle
                label="Entregado"
                description="Notifica cuando la entrega se completa exitosamente"
                checked={settings.notify_on_delivered}
                onChange={(v) => update('notify_on_delivered', v)}
              />
              <Toggle
                label="No entregado"
                description="Notifica cuando una entrega falla o no se pudo completar"
                checked={settings.notify_on_failed}
                onChange={(v) => update('notify_on_failed', v)}
              />
              <div className="border-t border-gray-100 pt-4">
                <Toggle
                  label="Encuesta de satisfaccion"
                  description="Envia una encuesta despues de cada entrega exitosa"
                  checked={settings.send_survey}
                  onChange={(v) => update('send_survey', v)}
                />
                {settings.send_survey && (
                  <div className="mt-3 ml-12">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Tiempo de espera (minutos)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={settings.survey_delay_minutes}
                      onChange={(e) => update('survey_delay_minutes', Number(e.target.value))}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Minutos despues de la entrega para enviar la encuesta
                    </p>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {activeSection === 'customization' && (
          <SectionCard
            title="Personalizacion"
            description="Personaliza la apariencia de las notificaciones enviadas a tus clientes."
          >
            <div className="space-y-3">
              <Field
                label="Logo URL"
                value={settings.logo_url}
                onChange={(v) => update('logo_url', v)}
                placeholder="https://miempresa.cl/logo.png"
              />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Color primario
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.primary_color}
                    onChange={(e) => update('primary_color', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={settings.primary_color}
                    onChange={(e) => update('primary_color', e.target.value)}
                    className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                    placeholder="#6366f1"
                  />
                  <div
                    className="h-10 flex-1 rounded-lg border border-gray-200"
                    style={{ backgroundColor: settings.primary_color }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Umbral "llegando" (paradas restantes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.arriving_threshold_stops}
                  onChange={(e) => update('arriving_threshold_stops', Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Numero de paradas restantes para disparar la notificacion "Llegando"
                </p>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────── */

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-sm font-semibold mb-0.5">{title}</h3>
      <p className="text-xs text-gray-400 mb-5">{description}</p>
      {children}
    </div>
  )
}

function Toggle({
  label,
  description,
  icon,
  checked,
  onChange,
}: {
  label: string
  description: string
  icon?: React.ReactNode
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3">
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
          checked ? 'bg-blue-500' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
