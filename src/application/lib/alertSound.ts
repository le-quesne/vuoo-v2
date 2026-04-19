/**
 * Lightweight alert sound module using the Web Audio API.
 *
 * Plays a short two-tone beep for high-priority alerts. The user's mute
 * preference is persisted in localStorage and defaults to muted.
 */

const STORAGE_KEY = 'vuoo.alertSoundMuted'

// Lazy singleton AudioContext reused across beeps.
let audioContext: AudioContext | null = null

interface WebkitWindow extends Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webkitAudioContext?: any
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext) return audioContext

  try {
    const Ctor =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return null
    audioContext = new Ctor() as AudioContext
    return audioContext
  } catch {
    return null
  }
}

export function isAlertSoundMuted(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return true
    if (raw === 'false') return false
    return true
  } catch {
    return true
  }
}

export function setAlertSoundMuted(muted: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(STORAGE_KEY, String(muted))
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

/**
 * Schedules a single sine beep on the shared AudioContext.
 * Envelope: 10ms attack → sustain at 0.15 → 80ms release.
 */
function scheduleBeep(
  ctx: AudioContext,
  frequency: number,
  startOffset: number,
  sustainMs: number
): void {
  const now = ctx.currentTime + startOffset
  const attack = 0.01
  const sustain = sustainMs / 1000
  const release = 0.08
  const peakGain = 0.15

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = frequency

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peakGain, now + attack)
  gain.gain.setValueAtTime(peakGain, now + attack + sustain)
  gain.gain.linearRampToValueAtTime(0, now + attack + sustain + release)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + attack + sustain + release + 0.02)
}

export function playAlertBeep(): void {
  if (isAlertSoundMuted()) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === 'suspended') {
      // Fire and forget — resume returns a promise but we don't await it.
      void ctx.resume().catch(() => {
        /* ignore */
      })
    }

    // Two-tone beep: 880Hz at t=0, 1320Hz at t=120ms.
    scheduleBeep(ctx, 880, 0, 0.12)
    scheduleBeep(ctx, 1320, 0.12, 0.12)
  } catch {
    // SSR, audio denied, or any unexpected failure — silent.
  }
}
