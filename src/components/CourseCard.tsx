import { useNavigate } from 'react-router-dom'
import type { HTMLAttributes, ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import type { Course } from '../types'
import { useI18n, CourseCover, ProgressRing, KebabMenu, type MenuItem } from './ui'
import { courseStats } from '../lib/utils'

export type DropMode = 'before' | 'after' | 'inside'

export function CourseCard({
  course,
  menu,
  compact = false,
  view = 'grid',
  childCount,
  percent,
  dragging = false,
  dropMode = null,
  dragProps,
  extra,
}: {
  course: Course
  menu?: MenuItem[]
  compact?: boolean
  view?: 'grid' | 'list'
  childCount?: number
  percent?: number
  dragging?: boolean
  dropMode?: DropMode | null
  dragProps?: HTMLAttributes<HTMLElement>
  extra?: ReactNode
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const stats = courseStats(course)
  const folder = !!course.isFolder
  const shownPercent = percent ?? stats.percent
  const cover =
    course.lessons.find((l) => !l.completed && l.thumbnail)?.thumbnail ||
    course.lessons.find((l) => l.thumbnail)?.thumbnail

  return (
    <article
      className={`course-card ${compact ? 'compact' : ''} ${view === 'list' ? 'list' : ''} ${folder ? 'folder-card' : ''} ${dragging ? 'dragging' : ''} ${dropMode ? `drop-${dropMode}` : ''}`}
      onClick={() => navigate(`/course/${course.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/course/${course.id}`)
      }}
      {...dragProps}
    >
      {folder ? (
        <div
          className="folder-cover"
          style={
            {
              '--folder-color': course.color,
              background: `linear-gradient(135deg, ${course.color}2e, ${course.color}0d)`,
            } as React.CSSProperties
          }
        >
          <span className="folder-emoji">{course.emoji}</span>
          {typeof childCount === 'number' && (
            <span className="folder-count">{t('lib.items', { n: childCount })}</span>
          )}
          {dropMode === 'inside' && <span className="folder-drop-hint">{t('lib.dropInside')}</span>}
        </div>
      ) : (
        <CourseCover
          thumbnail={cover}
          emoji={course.emoji}
          color={course.color}
          title={course.title}
          className="course-cover"
        >
          <span
            className="course-emoji-badge"
            style={{ background: `${course.color}33`, borderColor: `${course.color}55` }}
          >
            {course.emoji}
          </span>
          {shownPercent === 100 && stats.total > 0 && (
            <span className="course-done-badge">✓ {t('common.completed')}</span>
          )}
          <ProgressRing
            percent={shownPercent}
            size={46}
            stroke={4}
            color={course.color}
            track="rgba(255,255,255,.18)"
          >
            <span className="ring-pct">{shownPercent}%</span>
          </ProgressRing>
        </CourseCover>
      )}

      <div className="course-body">
        <div className="course-title-row">
          <h3 className="course-title">{course.title}</h3>
          {menu && (
            <div className="course-menu" onClick={(e) => e.stopPropagation()}>
              <KebabMenu items={menu} />
            </div>
          )}
        </div>
        {course.description && !compact && <p className="course-desc">{course.description}</p>}
        {folder ? (
          <div className="course-meta">
            <span>{t('lib.folder')}</span>
            <span className="dot" />
            <span>{t('lib.items', { n: childCount ?? 0 })}</span>
          </div>
        ) : (
          <>
            <div className="course-meta">
              <span>{t('lib.progressOf', { done: stats.done, total: stats.total })}</span>
              <span className="dot" />
              <span>
                {stats.done === stats.total && stats.total > 0
                  ? t('common.completed')
                  : t('common.inProgress')}
              </span>
            </div>
            <div className="course-bar">
              <span style={{ width: `${shownPercent}%`, background: course.color }} />
            </div>
          </>
        )}
        {extra}
      </div>
    </article>
  )
}

export function useCourseMenu(
  course: Course,
  actions: { onShare: () => void; onDuplicate: () => void; onDelete: () => void },
): MenuItem[] {
  const { t } = useI18n()
  return [
    { label: t('common.share'), icon: <MoreVertical size={15} />, onClick: actions.onShare },
    { label: t('lib.duplicate'), icon: <MoreVertical size={15} />, onClick: actions.onDuplicate },
    { label: t('common.delete'), icon: <MoreVertical size={15} />, onClick: actions.onDelete, danger: true },
  ]
}
