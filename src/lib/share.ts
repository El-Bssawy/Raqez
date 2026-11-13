import type { Course, Lesson, LessonKind } from '../types'
import { uid } from './utils'

interface SharedLesson {
  title: string
  kind: LessonKind
  url?: string
  videoId?: string
  duration?: number
  thumbnail?: string
  author?: string
}

export interface SharedCourse {
  v: 1
  title: string
  description?: string
  emoji?: string
  color?: string
  lessons: SharedLesson[]
  from?: string
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeCourse(course: Course, from?: string): string {
  const payload: SharedCourse = {
    v: 1,
    title: course.title,
    description: course.description,
    emoji: course.emoji,
    color: course.color,
    from,
    lessons: course.lessons.map((l) => ({
      title: l.title,
      kind: l.kind,
      url: l.url,
      videoId: l.videoId,
      duration: l.duration,
      thumbnail: l.thumbnail,
      author: l.author,
    })),
  }
  return toBase64Url(JSON.stringify(payload))
}

export function decodeCourse(encoded: string): SharedCourse | null {
  try {
    const raw = fromBase64Url(encoded)
    const data = JSON.parse(raw)
    if (!data || data.v !== 1 || !Array.isArray(data.lessons) || typeof data.title !== 'string') return null
    return data as SharedCourse
  } catch {
    return null
  }
}

export function buildShareUrl(course: Course, from?: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}import`
  return `${base}?c=${encodeCourse(course, from)}`
}

export function courseFromShared(shared: SharedCourse): Course {
  const now = Date.now()
  const lessons: Lesson[] = shared.lessons.map((l, i) => ({
    id: uid('l_'),
    title: l.title || 'Untitled lesson',
    kind: l.kind || 'link',
    url: l.url,
    videoId: l.videoId,
    duration: l.duration,
    thumbnail: l.thumbnail,
    author: l.author,
    completed: false,
    position: 0,
    watched: 0,
    notes: [],
    createdAt: now + i,
  }))
  return {
    id: uid('c_'),
    title: shared.title || 'Shared course',
    description: shared.description,
    emoji: shared.emoji || '📚',
    color: shared.color || '#8b5cf6',
    lessons,
    createdAt: now,
    updatedAt: now,
  }
}
