import { useMemo, useState } from 'react'
import { Check, Copy, Download, Link2, Share2 } from 'lucide-react'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { useToasts } from '../store/toasts'
import { useI18n, Modal } from './ui'
import { buildShareUrl } from '../lib/share'
import { copyText, downloadFile, formatClock } from '../lib/utils'

export function ShareModal() {
  const courseId = useUI((s) => s.shareCourseId)
  const closeShare = useUI((s) => s.closeShare)
  const course = useStore((s) => s.courses.find((c) => c.id === courseId))
  const name = useStore((s) => s.settings.name)
  const { t } = useI18n()
  const pushToast = useToasts((s) => s.push)
  const [copied, setCopied] = useState(false)

  const url = useMemo(() => (course ? buildShareUrl(course, name) : ''), [course, name])

  if (!courseId || !course) return null

  const copy = async () => {
    const ok = await copyText(url)
    if (ok) {
      setCopied(true)
      pushToast(t('share.copied'))
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const download = () => {
    const payload = {
      v: 1,
      title: course.title,
      description: course.description,
      emoji: course.emoji,
      color: course.color,
      from: name,
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
    const safe = course.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'course'
    downloadFile(`${safe}.rakkez.json`, JSON.stringify(payload, null, 2))
    pushToast(t('share.downloaded'))
  }

  return (
    <Modal
      open
      onClose={closeShare}
      title={
        <span className="row gap-2">
          <Share2 size={20} /> {t('share.title')}
        </span>
      }
      subtitle={t('share.desc')}
      size="md"
      footer={
        <button className="btn btn-ghost" onClick={closeShare}>
          {t('common.close')}
        </button>
      }
    >
      <div className="share-course">
        <div className="share-emoji" style={{ background: `${course.color}22`, borderColor: `${course.color}44` }}>
          {course.emoji}
        </div>
        <div>
          <strong>{course.title}</strong>
          <span className="muted block">{t('share.preview', { n: course.lessons.length })}</span>
        </div>
      </div>

      <div className="share-list">
        {course.lessons.slice(0, 4).map((l, i) => (
          <div className="share-lesson" key={l.id}>
            <span className="share-index">{i + 1}</span>
            <span className="share-title">{l.title}</span>
            {l.duration ? <span className="muted mono">{formatClock(l.duration)}</span> : null}
          </div>
        ))}
        {course.lessons.length > 4 && (
          <div className="share-more">+{course.lessons.length - 4}</div>
        )}
      </div>

      <div className="field">
        <label className="field-label">{t('share.link')}</label>
        <div className="input-row">
          <input className="input mono" dir="ltr" readOnly value={url} onFocus={(e) => e.target.select()} />
          <button className="btn btn-secondary" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {t('share.copyLink')}
          </button>
        </div>
        <button className="btn btn-ghost mt-2" onClick={download}>
          <Download size={16} /> {t('share.downloadFile')}
        </button>
      </div>

      <div className="share-note">
        <Link2 size={16} />
        <span>{t('settings.privacyText')}</span>
      </div>
    </Modal>
  )
}
