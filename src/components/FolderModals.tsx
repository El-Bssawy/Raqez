import { useEffect, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { useStore, parentOf } from '../store/store'
import { useToasts } from '../store/toasts'
import { Field, Modal, useI18n } from './ui'

const FOLDER_EMOJIS = ['📁', '📂', '🗂️', '📚', '🧠', '🎓', '🧪', '🎨', '💻', '🌍', '⚡', '🎯']
const FOLDER_COLORS = ['#8b5cf6', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#a78bfa']

export function FolderModal({
  open,
  onClose,
  parentId = null,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  parentId?: string | null
  onCreated?: (id: string) => void
}) {
  const { t } = useI18n()
  const createCourse = useStore((s) => s.createCourse)
  const courses = useStore((s) => s.courses)
  const pushToast = useToasts((s) => s.push)

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📁')
  const [color, setColor] = useState('#8b5cf6')

  useEffect(() => {
    if (open) {
      setName('')
      setEmoji('📁')
      setColor('#8b5cf6')
    }
  }, [open])

  const parent = parentId ? courses.find((c) => c.id === parentId) : null

  const submit = () => {
    if (!name.trim()) return
    const id = createCourse({
      title: name.trim(),
      emoji,
      color,
      isFolder: true,
      parentId: parent?.id ?? null,
    })
    pushToast(t('folder.created'))
    onCreated?.(id)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="row gap-2">
          <FolderPlus size={20} /> {t('folder.newTitle')}
        </span>
      }
      subtitle={parent ? `${t('folder.parent')}: ${parent.title}` : undefined}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            {t('folder.create')}
          </button>
        </>
      }
    >
      <Field label={t('folder.name')}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('folder.namePlaceholder')}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </Field>
      <Field label={t('folder.emoji')}>
        <div className="emoji-grid">
          {FOLDER_EMOJIS.map((item) => (
            <button
              key={item}
              className={`emoji-btn ${emoji === item ? 'active' : ''}`}
              onClick={() => setEmoji(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t('folder.color')}>
        <div className="color-grid">
          {FOLDER_COLORS.map((item) => (
            <button
              key={item}
              className={`color-btn ${color === item ? 'active' : ''}`}
              style={{ background: item }}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
      </Field>
    </Modal>
  )
}

export function MoveToFolderModal({
  open,
  onClose,
  courseId,
}: {
  open: boolean
  onClose: () => void
  courseId: string | null
}) {
  const { t } = useI18n()
  const courses = useStore((s) => s.courses)
  const moveCourse = useStore((s) => s.moveCourse)
  const pushToast = useToasts((s) => s.push)

  if (!courseId) return null
  const moving = courses.find((c) => c.id === courseId)
  if (!moving) return null

  const banned = new Set([courseId])
  const walk = (id: string) => {
    courses.filter((c) => parentOf(c) === id).forEach((c) => {
      banned.add(c.id)
      walk(c.id)
    })
  }
  walk(courseId)

  const targets: Array<{ id: string; title: string; depth: number }> = []
  const collect = (parentId: string | null, depth: number) => {
    courses
      .filter((c) => parentOf(c) === parentId && c.isFolder && !banned.has(c.id))
      .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
      .forEach((c) => {
        targets.push({ id: c.id, title: c.title, depth })
        collect(c.id, depth + 1)
      })
  }
  collect(null, 0)

  const moveTo = (parentId: string | null) => {
    const count = courses.filter((c) => parentOf(c) === parentId && c.id !== courseId).length
    moveCourse(courseId, parentId, count)
    pushToast(t('folder.moved'))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('folder.moveTitle')}
      subtitle={t('folder.moveDesc')}
      size="sm"
    >
      <div className="move-folder-list">
        <button
          className={`move-folder-row ${parentOf(moving) === null ? 'current' : ''}`}
          onClick={() => moveTo(null)}
        >
          <span className="move-folder-emoji">🏠</span>
          <span>{t('folder.rootOption')}</span>
        </button>
        {targets.length === 0 && <p className="field-hint">{t('folder.noTargets')}</p>}
        {targets.map((target) => (
          <button
            key={target.id}
            className={`move-folder-row ${parentOf(moving) === target.id ? 'current' : ''}`}
            style={{ paddingInlineStart: 14 + target.depth * 18 }}
            onClick={() => moveTo(target.id)}
          >
            <span className="move-folder-emoji">📁</span>
            <span>{target.title}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
