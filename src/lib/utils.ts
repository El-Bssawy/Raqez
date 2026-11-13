import type { Course, Lesson, Lang } from '../types'

export const uid = (prefix = '') =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateKeyOffset(daysAgo: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return todayKey(d)
}

/** 754 -> "12:34", 3671 -> "1:01:11" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Human readable total, hours & minutes only: 5400 -> "1س 30د" / "1h 30m" */
export function formatTotal(totalSeconds: number, lang: Lang = 'ar'): string {
  const minutes = Math.max(0, Math.round((totalSeconds || 0) / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (lang === 'ar') {
    if (h > 0 && m > 0) return `${h}س ${m}د`
    if (h > 0) return `${h}س`
    return `${m}د`
  }
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** Total for live counters — hours & minutes only, no seconds. */
export function formatPrecise(totalSeconds: number, lang: Lang = 'ar'): string {
  return formatTotal(totalSeconds, lang)
}

/** 5400 -> "1h 30m" always latin (for compact stat) */
export function formatShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function formatMinutes(totalSeconds: number, lang: Lang = 'ar'): string {
  const mins = Math.round((totalSeconds || 0) / 60)
  if (lang === 'ar') {
    if (mins >= 60) {
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return m ? `${h}س ${m}د` : `${h}س`
    }
    return `${mins}د`
  }
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

export function parseDurationText(text?: string): number | undefined {
  if (!text) return undefined
  const parts = text.trim().split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return undefined
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return undefined
}

export function relativeTime(ts: number, lang: Lang): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return lang === 'ar' ? 'الآن' : 'just now'
  if (min < 60) return lang === 'ar' ? `من ${min} دقيقة` : `${min}m ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return lang === 'ar' ? `من ${hours} ساعة` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return lang === 'ar' ? 'امبارح' : 'yesterday'
  if (days < 30) return lang === 'ar' ? `من ${days} يوم` : `${days}d ago`
  const d = new Date(ts)
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

export function longDate(lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
}

export function courseStats(course: Course) {
  const total = course.lessons.length
  const done = course.lessons.filter((l) => l.completed).length
  const percent = total ? Math.round((done / total) * 100) : 0
  const studied = course.lessons.reduce((sum, l) => sum + (l.watched || 0), 0)
  const duration = course.lessons.reduce((sum, l) => sum + (l.duration || 0), 0)
  return { total, done, percent, studied, duration }
}

export function nextLesson(course: Course, lessonId: string): Lesson | undefined {
  const i = course.lessons.findIndex((l) => l.id === lessonId)
  return i >= 0 ? course.lessons[i + 1] : undefined
}

export function prevLesson(course: Course, lessonId: string): Lesson | undefined {
  const i = course.lessons.findIndex((l) => l.id === lessonId)
  return i > 0 ? course.lessons[i - 1] : undefined
}

/** Study streak ending today or yesterday. */
export function computeStreak(daily: Record<string, number>): number {
  let streak = 0
  let offset = 0
  if (!daily[todayKey()] || daily[todayKey()] === 0) offset = 1
  for (let i = offset; i < 10000; i++) {
    const key = dateKeyOffset(i)
    if ((daily[key] || 0) > 0) streak++
    else break
  }
  return streak
}

export function bestStreak(daily: Record<string, number>): number {
  const days = Object.keys(daily)
    .filter((k) => (daily[k] || 0) > 0)
    .sort()
  let best = 0
  let current = 0
  let prev: Date | null = null
  for (const key of days) {
    const d = new Date(`${key}T12:00:00`)
    if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) current++
    else current = 1
    best = Math.max(best, current)
    prev = d
  }
  return best
}

export function todaySeconds(daily: Record<string, number>): number {
  return daily[todayKey()] || 0
}

export function sumSeconds(daily: Record<string, number>): number {
  return Object.values(daily).reduce((a, b) => a + (b || 0), 0)
}

export function downloadFile(filename: string, content: string | Blob, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function shufflePick<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}
