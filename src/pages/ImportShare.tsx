import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileJson,
  Link2,
  ListVideo,
  Play,
  Share2,
  Upload,
} from 'lucide-react'
import { useStore } from '../store/store'
import { useToasts } from '../store/toasts'
import { useI18n, EmptyState } from '../components/ui'
import { courseFromShared, decodeCourse, type SharedCourse } from '../lib/share'
import { formatClock } from '../lib/utils'

export default function ImportSharePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const createCourse = useStore((s) => s.createCourse)
  const pushToast = useToasts((s) => s.push)
  const fileRef = useRef<HTMLInputElement>(null)

  const encoded = params.get('c') || ''
  const decoded = useMemo(() => (encoded ? decodeCourse(encoded) : null), [encoded])
  const [fromFile, setFromFile] = useState<SharedCourse | null>(null)
  const [fileError, setFileError] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  const shared = fromFile || decoded
  const invalid = (!!encoded && !decoded) || fileError

  const addCourse = () => {
    if (!shared) return
    const course = courseFromShared(shared)
    const id = createCourse({
      title: course.title,
      description: course.description,
      emoji: course.emoji,
      color: course.color,
      lessons: course.lessons,
    })
    pushToast(t('share.imported'))
    navigate(`/course/${id}`)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    setFileError(false)
    try {
      const raw = await file.text()
      const data = JSON.parse(raw)
      if (data && Array.isArray(data.lessons) && typeof data.title === 'string') {
        setFromFile({ ...data, v: 1 } as SharedCourse)
      } else {
        setFileError(true)
      }
    } catch {
      setFileError(true)
    }
  }

  const openLink = () => {
    const raw = linkInput.trim()
    if (!raw) return
    try {
      const url = new URL(raw)
      const code = url.searchParams.get('c')
      if (code) {
        navigate(`/import?c=${encodeURIComponent(code)}`)
        setLinkInput('')
        return
      }
    } catch {
      /* maybe the raw string is the encoded payload */
    }
    if (decodeCourse(raw)) {
      navigate(`/import?c=${encodeURIComponent(raw)}`)
      setLinkInput('')
    } else {
      setFileError(true)
    }
  }

  const totalDuration = shared ? shared.lessons.reduce((sum, l) => sum + (l.duration || 0), 0) : 0

  return (
    <div className="import-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('share.importTitle')}</h1>
          <p className="page-sub">{t('share.importDesc')}</p>
        </div>
        <Link to="/library" className="btn btn-secondary">
          <ArrowLeft size={16} className="rtl-flip" /> {t('course.backToLibrary')}
        </Link>
      </div>

      {shared ? (
        <section className="panel import-shared">
          <div className="import-shared-head">
            <div className="share-emoji" style={{ background: `${shared.color || '#8b5cf6'}22`, borderColor: `${shared.color || '#8b5cf6'}44` }}>
              {shared.emoji || '📚'}
            </div>
            <div className="import-shared-info">
              <h2>{shared.title}</h2>
              {shared.description && <p className="muted">{shared.description}</p>}
              <div className="course-banner-chips">
                <span>
                  <ListVideo size={14} /> {t('share.lessons', { n: shared.lessons.length })}
                </span>
                {totalDuration > 0 && (
                  <span>
                    <Play size={14} /> {formatClock(totalDuration)}
                  </span>
                )}
                {shared.from && (
                  <span>
                    <Share2 size={14} /> {t('share.from')} {shared.from}
                  </span>
                )}
              </div>
            </div>
          </div>

          {shared.lessons.length > 0 && (
            <div className="preview">
              <div className="preview-head">
                <span>{t('share.previewFirst')}</span>
                <span className="muted">{t('share.lessons', { n: shared.lessons.length })}</span>
              </div>
              <div className="preview-list">
                {shared.lessons.map((lesson, i) => (
                  <div className="preview-item" key={`${lesson.videoId || lesson.url || lesson.title}-${i}`}>
                    <span className="preview-index">{i + 1}</span>
                    <div className="preview-thumb">
                      {lesson.thumbnail ? (
                        <img src={lesson.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <FileJson size={16} />
                      )}
                      {lesson.duration ? <span>{formatClock(lesson.duration)}</span> : null}
                    </div>
                    <div className="preview-info">
                      <span className="preview-title">{lesson.title}</span>
                      {lesson.author && <span className="preview-author">{lesson.author}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="import-actions">
            <button className="btn btn-primary" onClick={addCourse}>
              <CheckCircle2 size={17} /> {t('share.importBtn')}
            </button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> {t('common.import')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                importFile(e.target.files?.[0])
                e.currentTarget.value = ''
              }}
            />
            <span className="field-hint inline-hint">{t('settings.privacyText')}</span>
          </div>
        </section>
      ) : (
        <section className="panel">
          <EmptyState
            icon={invalid ? <AlertTriangle size={30} /> : <Share2 size={30} />}
            title={invalid ? t('share.invalid') : t('share.importTitle')}
            desc={invalid ? t('share.importDesc') : t('share.desc')}
            action={
              <div className="row gap-2">
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} /> {t('settings.import')}
                </button>
                <Link to="/library" className="btn btn-secondary">
                  {t('nav.library')}
                </Link>
              </div>
            }
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              importFile(e.target.files?.[0])
              e.currentTarget.value = ''
            }}
          />
        </section>
      )}

      <section className="panel paste-link-panel">
        <div className="section-head">
          <h2>
            <Link2 size={18} /> {t('share.link')}
          </h2>
        </div>
        <p className="muted settings-desc">{t('share.desc')}</p>
        <div className="input-row">
          <input
            className="input mono"
            dir="ltr"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') openLink()
            }}
            placeholder={t('share.link')}
          />
          <button className="btn btn-secondary" onClick={openLink} disabled={!linkInput.trim()}>
            <ExternalLink size={16} /> {t('common.open')}
          </button>
        </div>
      </section>
    </div>
  )
}
