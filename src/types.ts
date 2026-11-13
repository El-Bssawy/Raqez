export type Lang = 'ar' | 'en'
export type Theme = 'dark' | 'light'
export type LessonKind = 'youtube' | 'video' | 'link' | 'local'
/** How time spent watching a lesson should be counted. */
export type StudyMode = 'study' | 'leisure' | 'none'
export type ViewMode = 'grid' | 'list'
export type AlarmId = 'chime' | 'bell' | 'digital' | 'siren' | 'custom'
/** Minutes saved for each time mode. `none` is always zero. */
export type ModeMinutes = Record<StudyMode, number>

export interface Note {
  id: string
  text: string
  at: number
  createdAt: number
}

export interface Lesson {
  id: string
  title: string
  kind: LessonKind
  url?: string
  videoId?: string
  duration?: number
  thumbnail?: string
  author?: string
  completed: boolean
  completedAt?: number
  position: number
  watched: number
  notes: Note[]
  createdAt: number
}

export interface Course {
  id: string
  title: string
  description?: string
  emoji: string
  color: string
  lessons: Lesson[]
  /** True when this item is a folder that holds other courses/folders. */
  isFolder?: boolean
  /** Parent folder id. Undefined/null means a root course. */
  parentId?: string | null
  /** Position among siblings (smaller first). */
  order?: number
  /** Default time mode for lessons inside this course. */
  mode?: StudyMode
  /** Keep synced playlist lessons in reverse order. */
  reverseLessons?: boolean
  sourceUrl?: string
  /** Last time the source playlist was checked for new videos. */
  lastSyncedAt?: number
  createdAt: number
  updatedAt: number
}

export interface Settings {
  name: string
  lang: Lang
  theme: Theme
  /** Id of the selected accent palette, or `custom` for a hand-picked color. */
  accentPalette: string
  /** Primary accent hex color used across the UI. */
  accentColor: string
  /** Secondary accent hex color used for gradients and highlights. */
  accentColor2: string
  apiKey: string
  autoComplete: boolean
  autoResume: boolean
  pomodoroWork: number
  pomodoroBreak: number
  /** Saved pomodoro focus duration (minutes) for every time mode. */
  pomodoroModeMinutes: ModeMinutes
  dailyGoal: number
  onboarded: boolean
  sidebarCollapsed: boolean
  libraryView: ViewMode
  timerMinutes: number
  /** Time type used by the full timer page. */
  timerMode: StudyMode
  /** Saved full-timer duration (minutes) for every time mode. */
  timerModeMinutes: ModeMinutes
  timerAlarm: AlarmId
  timerVolume: number
  timerVideoUrl: string
  timerCustomAlarmName: string
}

/** Per-course, per-day time buckets. */
export type CourseDaily = Record<string, Record<string, { study: number; leisure: number }>>

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface PlaylistVideo {
  videoId: string
  title: string
  duration?: number
  thumbnail?: string
  author?: string
}

export interface PlaylistResult {
  title: string
  description?: string
  videos: PlaylistVideo[]
}
