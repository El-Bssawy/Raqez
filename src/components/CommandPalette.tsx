import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  Download,
  Home,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Languages,
  PlayCircle,
  Timer,
} from 'lucide-react'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { useToasts } from '../store/toasts'
import { useI18n, CourseCover } from './ui'
import { downloadFile, todayKey } from '../lib/utils'

type Item =
  | { kind: 'course'; id: string; title: string; subtitle: string; thumb?: string; emoji: string; color: string; group: string }
  | { kind: 'lesson'; id: string; courseId: string; title: string; subtitle: string; thumb?: string; group: string }
  | {
      kind: 'action'
      id: string
      title: string
      subtitle?: string
      icon: 'home' | 'lib' | 'stats' | 'settings' | 'timer' | 'new' | 'theme' | 'lang' | 'export'
      group: string
      run: () => void
    }

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setPalette = useUI((s) => s.setPalette)
  const openImporter = useUI((s) => s.openImporter)
  const courses = useStore((s) => s.courses)
  const daily = useStore((s) => s.daily)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const pushToast = useToasts((s) => s.push)
  const navigate = useNavigate()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)

    const courseItems: Item[] = courses
      .filter((c) => match(c.title) || c.lessons.some((l) => match(l.title)))
      .slice(0, 6)
      .map((c) => ({
        kind: 'course' as const,
        id: c.id,
        title: c.title,
        subtitle: t('common.lessonsCount', { n: c.lessons.length }),
        thumb: c.lessons.find((l) => l.thumbnail)?.thumbnail,
        emoji: c.emoji,
        color: c.color,
        group: t('palette.courses'),
      }))

    const lessonItems: Item[] = q
      ? courses
          .flatMap((c) =>
            c.lessons
              .filter((l) => match(l.title))
              .map((l) => ({
                kind: 'lesson' as const,
                id: l.id,
                courseId: c.id,
                title: l.title,
                subtitle: c.title,
                thumb: l.thumbnail,
                group: t('palette.lessons'),
              })),
          )
          .slice(0, 8)
      : []

    const actionItems: Item[] = (
      [
        { id: 'new', label: t('palette.newCourse'), icon: 'new', run: () => openImporter({ mode: 'create' }) },
        { id: 'home', label: t('palette.goHome'), icon: 'home', run: () => navigate('/') },
        { id: 'lib', label: t('nav.library'), icon: 'lib', run: () => navigate('/library') },
        { id: 'stats', label: t('palette.goStats'), icon: 'stats', run: () => navigate('/stats') },
        { id: 'timer', label: t('nav.timer'), icon: 'timer', run: () => navigate('/timer') },
        { id: 'settings', label: t('palette.goSettings'), icon: 'settings', run: () => navigate('/settings') },
        {
          id: 'theme',
          label: t('palette.toggleTheme'),
          icon: 'theme',
          run: () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
        },
        {
          id: 'lang',
          label: t('palette.toggleLang'),
          icon: 'lang',
          run: () => updateSettings({ lang: settings.lang === 'ar' ? 'en' : 'ar' }),
        },
        {
          id: 'export',
          label: t('settings.export'),
          icon: 'export',
          run: () => {
            const data = {
              app: 'rakkez',
              version: 1,
              exportedAt: new Date().toISOString(),
              courses,
              daily,
              settings,
            }
            downloadFile(`rakkez-backup-${todayKey()}.json`, JSON.stringify(data, null, 2))
            pushToast(t('settings.exported'))
          },
        },
      ] as Array<{
        id: string
        label: string
        icon: 'home' | 'lib' | 'stats' | 'settings' | 'timer' | 'new' | 'theme' | 'lang' | 'export'
        run: () => void
      }>
    )
      .filter((a) => match(a.label))
      .map((a) => ({
        kind: 'action' as const,
        id: a.id,
        title: a.label,
        icon: a.icon,
        group: t('palette.actions'),
        run: a.run,
      }))

    return [...courseItems, ...lessonItems, ...actionItems]
  }, [query, courses, settings.theme, settings.lang, daily, openImporter, navigate, updateSettings, t, pushToast])

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, items.length - 1)))
  }, [items.length])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const run = (item: Item) => {
    setPalette(false)
    if (item.kind === 'course') navigate(`/course/${item.id}`)
    else if (item.kind === 'lesson') navigate(`/watch/${item.courseId}/${item.id}`)
    else item.run()
  }

  const iconFor = (icon: string) => {
    switch (icon) {
      case 'home':
        return <Home size={17} />
      case 'lib':
        return <BookOpen size={17} />
      case 'stats':
        return <BarChart3 size={17} />
      case 'timer':
        return <Timer size={17} />
      case 'settings':
        return <Settings size={17} />
      case 'new':
        return <Plus size={17} />
      case 'theme':
        return settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />
      case 'lang':
        return <Languages size={17} />
      case 'export':
        return <Download size={17} />
      default:
        return <Sparkles size={17} />
    }
  }

  let lastGroup = ''
  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="palette">
        <div className="palette-input">
          <Search size={19} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={t('palette.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(items.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const item = items[active]
                if (item) run(item)
              } else if (e.key === 'Escape') {
                setPalette(false)
              }
            }}
          />
          <kbd>ESC</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {items.length === 0 && <div className="palette-empty">{t('palette.empty')}</div>}
          {items.map((item, i) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={`${item.kind}-${item.id}`}>
                {showGroup && <div className="palette-group">{item.group}</div>}
                <button
                  data-index={i}
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  {item.kind === 'course' ? (
                    <CourseCover
                      thumbnail={item.thumb}
                      emoji={item.emoji}
                      color={item.color}
                      title={item.title}
                      className="palette-cover"
                    />
                  ) : item.kind === 'lesson' ? (
                    <span className="palette-icon lesson">
                      <PlayCircle size={18} />
                    </span>
                  ) : (
                    <span className="palette-icon">{iconFor(item.icon)}</span>
                  )}
                  <span className="palette-text">
                    <span className="palette-title">{item.title}</span>
                    {'subtitle' in item && item.subtitle && <span className="palette-sub">{item.subtitle}</span>}
                  </span>
                  {i === active && <kbd>↵</kbd>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t('palette.hint')}
          </span>
          <span>
            <kbd>↵</kbd> {t('palette.open')}
          </span>
        </div>
      </div>
    </div>
  )
}
