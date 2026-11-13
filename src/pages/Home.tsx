import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Flame,
  Layers,
  Link2,
  Play,
  Plus,
  Sparkles,
  Youtube,
  Zap,
} from 'lucide-react'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { useI18n, CourseCover } from '../components/ui'
import { CourseCard } from '../components/CourseCard'
import { computeStreak, courseStats, dateKeyOffset, formatClock, formatPrecise, formatTotal, sumSeconds, todaySeconds } from '../lib/utils'
import type { Course, Lesson } from '../types'

export default function Home() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const courses = useStore((s) => s.courses)
  const daily = useStore((s) => s.daily)
  const settings = useStore((s) => s.settings)
  const openImporter = useUI((s) => s.openImporter)
  const [quick, setQuick] = useState('')

  const streak = computeStreak(daily)
  const today = todaySeconds(daily)
  const totalTime = sumSeconds(daily)
  const totalDone = courses.reduce((n, c) => n + courseStats(c).done, 0)
  const totalLessons = courses.reduce((n, c) => n + c.lessons.length, 0)
  const goalPercent = Math.min(100, (today / Math.max(1, settings.dailyGoal * 60)) * 100)

  const continueItems = useMemo(() => {
    const list: Array<{ course: Course; lesson: Lesson }> = []
    for (const course of courses) {
      for (const lesson of course.lessons) {
        if (!lesson.completed && (lesson.position > 0 || lesson.watched > 0)) list.push({ course, lesson })
      }
    }
    if (!list.length) {
      for (const course of courses) {
        const first = course.lessons.find((l) => !l.completed)
        if (first) list.push({ course, lesson: first })
        if (list.length >= 2) break
      }
    }
    return list.slice(0, 3)
  }, [courses])

  const recent = useMemo(
    () => [...courses].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
    [courses],
  )

  const week = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const key = dateKeyOffset(6 - i)
      const date = new Date(`${key}T12:00:00`)
      const label = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short' }).format(date)
      return { key, label, seconds: daily[key] || 0 }
    })
  }, [daily, lang])
  const weekMax = Math.max(60, ...week.map((w) => w.seconds))
  const weekTotal = week.reduce((a, b) => a + b.seconds, 0)

  const submitQuick = (e: React.FormEvent) => {
    e.preventDefault()
    const link = quick.trim()
    if (!link) {
      openImporter({ mode: 'create' })
      return
    }
    openImporter({ mode: 'create', initialLink: link })
    setQuick('')
  }

  const greeting = settings.name
    ? t('dash.greeting', { name: settings.name })
    : t('dash.greetingAnon')

  return (
    <div className="home">
      <div className="page-head">
        <div>
          <h1 className="page-title">{greeting}</h1>
          <p className="page-sub">{t('dash.subtitle')}</p>
        </div>
        <button className="btn btn-primary hide-mobile" onClick={() => openImporter({ mode: 'create' })}>
          <Plus size={17} /> {t('lib.new')}
        </button>
      </div>

      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-copy">
          <span className="eyebrow">
            <Sparkles size={14} /> {t('appTagline')}
          </span>
          <h2>{t('dash.heroTitle')}</h2>
          <p>{t('dash.heroText')}</p>
          <form className="hero-form" onSubmit={submitQuick}>
            <Link2 size={18} className="hero-input-icon" />
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder={t('dash.heroInput')}
              dir="ltr"
              aria-label={t('dash.heroInput')}
            />
            <button className="btn btn-primary" type="submit">
              <Youtube size={17} /> {t('dash.heroBtn')}
            </button>
          </form>
          <div className="hero-chips">
            <span>
              <CheckCircle2 size={14} /> {t('guide.noAccount')}
            </span>
            <span>
              <Zap size={14} /> {t('guide.localOnly')}
            </span>
            <span>
              <Play size={14} /> {t('guide.free')}
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orb orb-a" />
          <div className="hero-orb orb-b" />
          <div className="hero-player">
            <div className="hero-player-top">
              <span />
              <span />
              <span />
            </div>
            <div className="hero-player-play">
              <Play size={26} fill="currentColor" />
            </div>
            <div className="hero-player-lines">
              <span style={{ width: '82%' }} />
              <span style={{ width: '58%' }} />
            </div>
          </div>
          <div className="hero-float float-streak">
            <Flame size={16} /> {streak} {t('common.days')}
          </div>
          <div className="hero-float float-focus">
            <span className="pulse-dot" /> Focus
          </div>
        </div>
      </section>

      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-icon flame">
            <Flame size={20} />
          </span>
          <div>
            <strong>{streak}</strong>
            <span>{t('dash.statStreak')}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon cyan">
            <Clock3 size={20} />
          </span>
          <div>
            <strong>{formatPrecise(today, lang)}</strong>
            <span>{t('dash.statToday')}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon green">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <strong>{totalDone}</strong>
            <span>{t('dash.statDone')}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon violet">
            <Layers size={20} />
          </span>
          <div>
            <strong>{courses.length}</strong>
            <span>{t('dash.statCourses')}</span>
          </div>
        </div>
      </section>

      <div className="home-grid">
        <div className="home-main">
          <section className="panel">
            <div className="section-head">
              <h2>
                <Play size={18} /> {t('dash.continue')}
              </h2>
              <Link to="/library" className="link-more">
                {t('common.viewAll')} <ArrowLeft size={14} className="rtl-flip" />
              </Link>
            </div>
            {continueItems.length === 0 ? (
              <div className="inline-empty">
                <span>{t('dash.noContinue')}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => openImporter({ mode: 'create' })}>
                  <Plus size={15} /> {t('dash.quickCreate')}
                </button>
              </div>
            ) : (
              <div className="continue-list">
                {continueItems.map(({ course, lesson }) => {
                  const percent = lesson.duration ? Math.min(100, (lesson.position / lesson.duration) * 100) : 0
                  const remaining = Math.max(0, (lesson.duration || 0) - lesson.position)
                  return (
                    <button
                      className="continue-item"
                      key={lesson.id}
                      onClick={() => navigate(`/watch/${course.id}/${lesson.id}`)}
                    >
                      <CourseCover
                        thumbnail={lesson.thumbnail}
                        emoji={course.emoji}
                        color={course.color}
                        title={lesson.title}
                        className="continue-thumb"
                      >
                        <span className="play-badge">
                          <Play size={18} fill="currentColor" />
                        </span>
                      </CourseCover>
                      <div className="continue-info">
                        <span className="continue-course">{course.title}</span>
                        <strong>{lesson.title}</strong>
                        <div className="continue-meta">
                          <span className="mono">
                            {formatClock(lesson.position)} / {lesson.duration ? formatClock(lesson.duration) : '—'}
                          </span>
                          {remaining > 0 && <span>{t('search.minutes', { n: Math.ceil(remaining / 60) })}</span>}
                        </div>
                        <div className="mini-progress">
                          <span style={{ width: `${percent}%`, background: course.color }} />
                        </div>
                      </div>
                      <span className="continue-cta">
                        {t('common.continue')} <ArrowLeft size={15} className="rtl-flip" />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>
                <Layers size={18} /> {t('dash.recent')}
              </h2>
              <Link to="/library" className="link-more">
                {t('common.viewAll')} <ArrowLeft size={14} className="rtl-flip" />
              </Link>
            </div>
            {courses.length === 0 ? (
              <div className="inline-empty">
                <span>{t('dash.recentEmptyDesc')}</span>
                <button className="btn btn-primary btn-sm" onClick={() => openImporter({ mode: 'create' })}>
                  <Plus size={15} /> {t('dash.quickCreate')}
                </button>
              </div>
            ) : (
              <div className="courses-grid home-courses">
                {recent.map((c) => (
                  <CourseCard key={c.id} course={c} compact />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="home-side">
          <div className="panel goal-panel">
            <div className="section-head">
              <h2>
                <Sparkles size={18} /> {t('dash.goal')}
              </h2>
            </div>
            <div className="goal-ring-wrap">
              <div className="goal-ring">
                <svg viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r="58" fill="none" stroke="var(--ring-track)" strokeWidth="10" />
                  <circle
                    cx="70"
                    cy="70"
                    r="58"
                    fill="none"
                    stroke="url(#goalGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 58}
                    strokeDashoffset={2 * Math.PI * 58 * (1 - goalPercent / 100)}
                    transform="rotate(-90 70 70)"
                  />
                  <defs>
                    <linearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--accent)" />
                      <stop offset="1" stopColor="var(--accent-2)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="goal-ring-text">
                  <strong>{formatPrecise(today, lang)}</strong>
                  <span>/ {settings.dailyGoal} {t('common.minutes')}</span>
                </div>
              </div>
            </div>
            <p className="goal-caption">
              {goalPercent >= 100 ? t('dash.goalDone') : t('dash.goalRemain', { n: Math.ceil((settings.dailyGoal * 60 - today) / 60) })}
            </p>
            <div className="goal-foot">
              <span>
                <Clock3 size={14} /> {formatTotal(totalTime, lang)}
              </span>
              <span>{t('dash.totalTime')}</span>
            </div>
          </div>

          <div className="panel">
            <div className="section-head">
              <h2>
                <BarChart3 size={18} /> {t('dash.weekly')}
              </h2>
              <span className="muted mono">{formatTotal(weekTotal, lang)}</span>
            </div>
            <div className="week-chart">
              {week.map((day) => (
                <div className="week-col" key={day.key} title={`${day.label} · ${formatTotal(day.seconds, lang)}`}>
                  <div className="week-bar-track">
                    <span
                      className={`week-bar ${day.key === dateKeyOffset(0) ? 'today' : ''}`}
                      style={{ height: `${Math.max(4, (day.seconds / weekMax) * 100)}%` }}
                    />
                  </div>
                  <span className="week-label">{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel tip-panel">
            <div className="tip-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <strong>{t('common.tip')}</strong>
              <p>{t('guide.tip1')}</p>
            </div>
          </div>

          <button className="panel quick-actions" onClick={() => navigate('/stats')}>
            <div className="row gap-2">
              <BarChart3 size={18} />
              <span>{t('nav.stats')}</span>
            </div>
            <span className="muted">
              {totalLessons ? `${totalDone}/${totalLessons}` : '—'} <ArrowLeft size={14} className="rtl-flip" />
            </span>
          </button>
        </aside>
      </div>
    </div>
  )
}
