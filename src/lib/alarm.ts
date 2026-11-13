import type { AlarmId } from '../types'

/* -------------------------------------------------------------------------- */
/* Web Audio — built-in alarm tones                                            */
/* -------------------------------------------------------------------------- */

let ctx: AudioContext | null = null
let loopTimer: number | null = null
let customAudio: HTMLAudioElement | null = null
let customUrl: string | null = null
const liveNodes = new Set<OscillatorNode>()

function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    return ctx
  } catch {
    return null
  }
}

/** Call once from a user gesture (start button, test button) to unlock audio. */
export async function primeAudio(): Promise<void> {
  const c = audioContext()
  if (c && c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      /* ignore */
    }
  }
}

export function stopAlarm(): void {
  if (loopTimer != null) {
    window.clearInterval(loopTimer)
    loopTimer = null
  }
  liveNodes.forEach((node) => {
    try {
      node.stop()
    } catch {
      /* already stopped */
    }
  })
  liveNodes.clear()
  if (customAudio) {
    try {
      customAudio.pause()
      customAudio.currentTime = 0
    } catch {
      /* ignore */
    }
    customAudio = null
  }
  if (customUrl) {
    URL.revokeObjectURL(customUrl)
    customUrl = null
  }
}

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  slideTo?: number,
) {
  const c = audioContext()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + start)
  if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, c.currentTime + start + duration)
  gain.gain.setValueAtTime(0.0001, c.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.02, volume), c.currentTime + start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + duration + 0.05)
  liveNodes.add(osc)
  osc.onended = () => liveNodes.delete(osc)
}

function playPattern(kind: Exclude<AlarmId, 'custom'>, volume: number) {
  const v = Math.max(0.04, Math.min(1, volume)) * 0.55
  switch (kind) {
    case 'bell':
      tone(1568, 0, 0.9, 'triangle', v)
      tone(2093, 0.04, 0.8, 'sine', v * 0.8)
      tone(1568, 0.5, 0.9, 'triangle', v * 0.7)
      break
    case 'digital':
      [0, 0.18, 0.36].forEach((t) => {
        tone(1046, t, 0.1, 'square', v * 0.75)
        tone(1396, t + 0.09, 0.1, 'square', v * 0.6)
      })
      break
    case 'siren':
      tone(620, 0, 0.7, 'sawtooth', v * 0.5, 1240)
      tone(1240, 0.75, 0.7, 'sawtooth', v * 0.5, 620)
      break
    case 'chime':
    default:
      ;[0, 0.22, 0.44].forEach((t, i) => {
        tone([880, 1174.66, 1567.98][i], t, 0.55, 'sine', v)
        tone([880, 1174.66, 1567.98][i] * 2, t, 0.4, 'sine', v * 0.28)
      })
      break
  }
}

/**
 * Start the chosen alarm. Returns false when a custom alarm was requested but
 * none is stored (caller may fall back to a built-in tone).
 */
export async function startAlarm(kind: AlarmId, volume = 0.8): Promise<boolean> {
  stopAlarm()
  const safeVolume = Math.max(0, Math.min(1, volume))

  if (kind === 'custom') {
    const blob = await getCustomAlarm()
    if (!blob) return false
    try {
      customUrl = URL.createObjectURL(blob)
      customAudio = new Audio(customUrl)
      customAudio.loop = true
      customAudio.volume = safeVolume
      await customAudio.play()
      return true
    } catch {
      stopAlarm()
      return false
    }
  }

  const c = audioContext()
  if (!c) return false
  await primeAudio()
  const play = () => playPattern(kind, safeVolume)
  play()
  loopTimer = window.setInterval(play, 2300)
  return true
}

/* -------------------------------------------------------------------------- */
/* IndexedDB storage for a custom alarm file                                   */
/* -------------------------------------------------------------------------- */

const DB_NAME = 'rakkez-audio'
const STORE = 'alarms'
const CUSTOM_KEY = 'custom-alarm'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveCustomAlarm(blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, CUSTOM_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getCustomAlarm(): Promise<Blob | null> {
  try {
    const db = await openDb()
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(CUSTOM_KEY)
      req.onsuccess = () => resolve((req.result as Blob) || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return blob
  } catch {
    return null
  }
}

export async function deleteCustomAlarm(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(CUSTOM_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* ignore */
  }
}
