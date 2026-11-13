import { useMemo, useState } from 'react'
import {
  Copy,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  Library,
  List,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore, childrenOf, descendantIds, sortCourses } from '../store/store'
import { useUI } from '../store/ui'
import { useToasts } from '../store/toasts'
import { useI18n, ConfirmDialog, EmptyState, Select } from '../components/ui'
import { CourseCard, type DropMode } from '../components/CourseCard'
import { FolderModal, MoveToFolderModal } from '../components/FolderModals'
import { courseStats } from '../lib/utils'
import type { Course } from '../types'

type Filter = 'all' | 'active' | 'done' | 'new'
type Sort = 'manual' | 'recent' | 'progress' | 'name'
type DropZone = { id: string; mode: DropMode } | null

export default function LibraryPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const courses = useStore((s) => s.courses)
  const settings = useStore((s) => s.settings)
  const deleteCourse = useStore((s) => s.deleteCourse)
  const duplicateCourse = useStore((s) => s.duplicateCourse)
  const moveCourse = useStore((s) => s.moveCourse)
  const updateSettings = useStore((s) => s.updateSettings)
  const openImporter = useUI((s) => s.openImporter)
  const openShare = useUI((s) => s.openShare)
  const pushToast = useToasts((s) => s.push)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('manual')
  const [toDelete, setToDelete] = useState<Course | null>(null)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderParent, setFolderParent] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropZone, setDropZone] = useState<DropZone>(null)

  const view = settings.libraryView

  const itemCount = (id: string) => childrenOf(courses, id).length

  const percentOf = (course: Course) => {
    if (!course.isFolder) return courseStats(course).percent
    const ids = [course.id, ...descendantIds(courses, course.id)]
    let done = 0
    let total = 0
    ids.forEach((id) => {
      const c = courses.find((x) => x.id === id)
      if (c && !c.isFolder) {
        const stats = courseStats(c)
        done += stats.done
        total += stats.total
      }
    })
    return total ? Math.round((done / total) * 100) : 0
  }

  const statusOf = (course: Course) => {
    if (!course.isFolder) return courseStats(course)
    const ids = [course.id, ...descendantIds(courses, course.id)]
    let done = 0
    let total = 0
    ids.forEach((id) => {
      const c = courses.find((x) => x.id === id)
      if (c && !c.isFolder) {
        const stats = courseStats(c)
        done += stats.done
        total += stats.total
      }
    })
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
  }

  const matches = (course: Course, q: string): boolean => {
    if (!q) return true
    if (course.title.toLowerCase().includes(q)) return true
    if (course.description?.toLowerCase().includes(q)) return true
    if (!course.isFolder) return course.lessons.some((l) => l.title.toLowerCase().includes(q))
    return descendantIds(courses, course.id).some((id) => {
      const child = courses.find((c) => c.id === id)
      if (!child) return false
      if (child.title.toLowerCase().includes(q)) return true
      return child.lessons.some((l) => l.title.toLowerCase().includes(q))
    })
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = childrenOf(courses, null).filter((course) => {
      if (!matches(course, q)) return false
      const stats = statusOf(course)
      if (filter === 'active') return stats.percent > 0 && stats.percent < 100
      if (filter === 'done') return stats.percent === 100 && stats.total > 0
      if (filter === 'new') return stats.done === 0
      return true
    })
    if (sort === 'manual') result = sortCourses(result)
    else if (sort === 'name')
      result = [...result].sort((a, b) => a.title.localeCompare(b.title, lang === 'ar' ? 'ar' : 'en'))
    else if (sort === 'progress') result = [...result].sort((a, b) => percentOf(a) - percentOf(b))
    else result = [...result].sort((a, b) => b.updatedAt - a.updatedAt)
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, query, filter, sort, lang])

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: t('lib.filterAll') },
    { id: 'active', label: t('lib.filterActive') },
    { id: 'done', label: t('lib.filterDone') },
    { id: 'new', label: t('lib.filterNew') },
  ]

  const menuFor = (course: Course) => {
    const shared = [
      {
        label: t('folder.moveTo'),
        icon: <FolderInput size={15} />,
        onClick: () => setMoveTarget(course.id),
      },
      {
        label: t('lib.duplicate'),
        icon: <Copy size={15} />,
        onClick: () => {
          const id = duplicateCourse(course.id)
          if (id) pushToast(t('toast.courseCreated'))
        },
      },
      {
        label: t('common.delete'),
        icon: <Trash2 size={15} />,
        onClick: () => setToDelete(course),
        danger: true,
      },
    ]
    if (course.isFolder) {
      return [
        {
          label: t('folder.newSub'),
          icon: <FolderPlus size={15} />,
          onClick: () => {
            setFolderParent(course.id)
            setFolderOpen(true)
          },
        },
        {
          label: t('course.addLessons'),
          icon: <Plus size={15} />,
          onClick: () => openImporter({ mode: 'create', parentId: course.id }),
        },
        ...shared,
      ]
    }
    return [
      { label: t('common.share'), icon: <Share2 size={15} />, onClick: () => openShare(course.id) },
      ...shared,
    ]
  }

  const clearDrag = () => {
    setDragId(null)
    setDropZone(null)
  }

  const canDropInside = (target: Course) => {
    if (!dragId || !target.isFolder || target.id === dragId) return false
    return !descendantIds(courses, dragId).includes(target.id)
  }

  const doDrop = (target: Course) => {
    const zone = dropZone?.id === target.id ? dropZone.mode : 'before'
    if (!dragId || dragId === target.id) {
      clearDrag()
      return
    }
    if (zone === 'inside') {
      if (!canDropInside(target)) {
        pushToast(t('folder.cycle'), 'error')
        clearDrag()
        return
      }
      moveCourse(dragId, target.id, childrenOf(courses, target.id).length)
    } else {
      const parent = target.parentId ?? null
      const siblings = sortCourses(childrenOf(courses, parent)).filter((c) => c.id !== dragId)
      let index = siblings.findIndex((c) => c.id === target.id)
      if (index < 0) index = siblings.length
      if (zone === 'after') index += 1
      moveCourse(dragId, parent, index)
    }
    pushToast(t('toast.moved'), 'info')
    clearDrag()
  }

  const dragProps = (course: Course) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      setDragId(course.id)
      if (sort !== 'manual') setSort('manual')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', course.id)
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!dragId || dragId === course.id) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = rect.height ? (e.clientY - rect.top) / rect.height : 0.5
      let mode: DropMode = ratio < 0.5 ? 'before' : 'after'
      if (canDropInside(course) && ratio > 0.26 && ratio < 0.74) mode = 'inside'
      setDropZone((current) =>
        current?.id === course.id && current.mode === mode ? current : { id: course.id, mode },
      )
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      const next = e.relatedTarget as Node | null
      if (next && e.currentTarget.contains(next)) return
      setDropZone((current) => (current?.id === course.id ? null : current))
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      doDrop(course)
    },
    onDragEnd: clearDrag,
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('lib.title')}</h1>
          <p className="page-sub">{t('lib.subtitle')}</p>
        </div>
        <div className="row gap-2">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setFolderParent(null)
              setFolderOpen(true)
            }}
          >
            <FolderPlus size={17} /> {t('lib.createFolder')}
          </button>
          <button className="btn btn-primary" onClick={() => openImporter({ mode: 'create' })}>
            <Plus size={17} /> {t('lib.new')}
          </button>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Library size={30} />}
            title={t('lib.empty')}
            desc={t('lib.emptyDesc')}
            action={
              <div className="row gap-2">
                <button className="btn btn-secondary" onClick={() => setFolderOpen(true)}>
                  <FolderPlus size={17} /> {t('lib.createFolder')}
                </button>
                <button className="btn btn-primary" onClick={() => openImporter({ mode: 'create' })}>
                  <Plus size={17} /> {t('lib.new')}
                </button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.searchPlaceholder')}
              />
            </div>
            <div className="filter-chips">
              {filters.map((f) => (
                <button
                  key={f.id}
                  className={`chip ${filter === f.id ? 'active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Select
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              options={[
                { value: 'manual', label: t('lib.sortManual') },
                { value: 'recent', label: t('lib.sortRecent') },
                { value: 'progress', label: t('lib.sortProgress') },
                { value: 'name', label: t('lib.sortName') },
              ]}
            />
            <div className="view-toggle">
              <button
                className={view === 'grid' ? 'active' : ''}
                onClick={() => updateSettings({ libraryView: 'grid' })}
                title={t('lib.viewGrid')}
                aria-label={t('lib.viewGrid')}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={view === 'list' ? 'active' : ''}
                onClick={() => updateSettings({ libraryView: 'list' })}
                title={t('lib.viewList')}
                aria-label={t('lib.viewList')}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {sort === 'manual' && list.length > 1 && (
            <p className="drag-hint">{t('lib.dragHint')}</p>
          )}

          {list.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={<Search size={28} />}
                title={t('common.noResults')}
                desc={query || filter !== 'all' ? t('lib.subtitle') : undefined}
              />
            </div>
          ) : (
            <div className={`courses-grid ${view === 'list' ? 'list-view' : ''}`}>
              {list.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  view={view}
                  percent={percentOf(course)}
                  childCount={course.isFolder ? itemCount(course.id) : undefined}
                  menu={menuFor(course)}
                  dragging={dragId === course.id}
                  dropMode={dropZone?.id === course.id && dragId !== course.id ? dropZone.mode : null}
                  dragProps={dragProps(course)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <FolderModal
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        parentId={folderParent}
        onCreated={(id) => navigate(`/course/${id}`)}
      />

      <MoveToFolderModal
        open={!!moveTarget}
        courseId={moveTarget}
        onClose={() => setMoveTarget(null)}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteCourse(toDelete.id)
            pushToast(t('toast.courseDeleted'), 'info')
          }
        }}
        title={t('lib.deleteTitle')}
        desc={
          toDelete && descendantIds(courses, toDelete.id).length > 0
            ? t('folder.deleteNested')
            : t('lib.deleteDesc')
        }
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
