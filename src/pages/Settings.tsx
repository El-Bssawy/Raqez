import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenCheck,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  KeyRound,
  Languages,
  Moon,
  Palette,
  Save,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'
import { useStore, type BackupData } from '../store/store'
import { useToasts } from '../store/toasts'
import { Field, ProgressBar, Toggle, useI18n } from '../components/ui'
import { ColorStudio } from '../components/Appearance'
import { downloadFile, formatBytes, todayKey } from '../lib/utils'

const APP_VERSION = '1.0.0'
const STORAGE_BUDGET = 5 * 1024 * 1024

export default function SettingsPage() {
  const { t, lang } = useI18n()
  const settings = useStore((s) => s.settings)
  const courses = useStore((s) => s.courses)
  const daily = useStore((s) => s.daily)
  const updateSettings = useStore((s) => s.updateSettings)
  const importBackup = useStore((s) => s.importBackup)
  const resetAll = useStore((s) => s.resetAll)
  const pushToast = useToasts((s) => s.push)

  const [name, setName] = useState(settings.name)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [showKey, setShowKey] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(settings.name), [settings.name])
  useEffect(() => setApiKey(settings.apiKey), [settings.apiKey])

  const storageBytes = useMemo(() => {
    try {
      const raw = localStorage.getItem('rakkez-state-v1')
      return raw ? new Blob([raw]).size : 0
    } catch {
      return 0
    }
  }, [courses, daily, settings])

  const storagePercent = Math.min(100, (storageBytes / STORAGE_BUDGET) * 100)
  const lessonCount = courses.reduce((n, c) => n + c.lessons.length, 0)
  const noteCount = courses.reduce((n, c) => n + c.lessons.reduce((m, l) => m + l.notes.length, 0), 0)

  const saveName = () => {
    updateSettings({ name: name.trim() })
    pushToast(t('toast.settingsSaved'))
  }

  const saveKey = () => {
    updateSettings({ apiKey: apiKey.trim() })
    pushToast(t('settings.apiKeySaved'))
  }

  const exportBackup = () => {
    const data: BackupData = {
      app: 'rakkez',
      version: 2,
      exportedAt: new Date().toISOString(),
      courses,
      daily,
      leisure: useStore.getState().leisure,
      courseDaily: useStore.getState().courseDaily,
      settings,
    }
    downloadFile(`rakkez-backup-${todayKey()}.json`, JSON.stringify(data, null, 2))
    pushToast(t('settings.exported'))
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 12 * 1024 * 1024) {
      pushToast(t('toast.fileTooBig'), 'error')
      return
    }
    try {
      const raw = await file.text()
      const data = JSON.parse(raw) as BackupData
      if (!data || !Array.isArray(data.courses)) {
        pushToast(t('settings.importFail'), 'error')
        return
      }
      const ok = importBackup(data)
      pushToast(ok ? t('settings.importOk') : t('settings.importFail'), ok ? 'success' : 'error')
    } catch {
      pushToast(t('settings.importFail'), 'error')
    }
  }

  const clampNum = (value: string, min: number, max: number, fallback: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, Math.round(n)))
  }

  const resetWord = t('settings.resetWord')
  const canReset = confirmText.trim() === resetWord

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile */}
        <section className="panel">
          <div className="section-head">
            <h2>
              <UserRound size={18} /> {t('settings.profile')}
            </h2>
          </div>
          <Field label={t('settings.name')} hint={t('settings.nameHint')}>
            <div className="input-row">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('settings.namePlaceholder')}
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName()
                }}
              />
              <button className="btn btn-secondary" onClick={saveName} disabled={name.trim() === settings.name.trim()}>
                <Save size={16} /> {t('common.save')}
              </button>
            </div>
          </Field>
        </section>

        {/* Appearance & language */}
        <section className="panel">
          <div className="section-head">
            <h2>
              <Palette size={18} /> {t('settings.appearance')}
            </h2>
          </div>

          <Field label={t('settings.language')}>
            <div className="segmented">
              <button
                className={settings.lang === 'ar' ? 'active' : ''}
                onClick={() => updateSettings({ lang: 'ar' })}
              >
                <Languages size={15} /> العربية
              </button>
              <button
                className={settings.lang === 'en' ? 'active' : ''}
                onClick={() => updateSettings({ lang: 'en' })}
              >
                <Languages size={15} /> English
              </button>
            </div>
          </Field>

          <Field label={t('settings.theme')}>
            <div className="segmented">
              <button
                className={settings.theme === 'dark' ? 'active' : ''}
                onClick={() => updateSettings({ theme: 'dark' })}
              >
                <Moon size={15} /> {t('settings.dark')}
              </button>
              <button
                className={settings.theme === 'light' ? 'active' : ''}
                onClick={() => updateSettings({ theme: 'light' })}
              >
                <Sun size={15} /> {t('settings.light')}
              </button>
            </div>
          </Field>

          <p className="field-hint">{t('settings.exportShortcut')}</p>

          <div className="settings-color-studio">
            <ColorStudio />
          </div>
        </section>

        {/* Study */}
        <section className="panel">
          <div className="section-head">
            <h2>
              <BookOpenCheck size={18} /> {t('settings.study')}
            </h2>
          </div>

          <Toggle
            checked={settings.autoComplete}
            onChange={(v) => updateSettings({ autoComplete: v })}
            label={t('settings.autoComplete')}
            desc={t('settings.autoCompleteDesc')}
          />
          <Toggle
            checked={settings.autoResume}
            onChange={(v) => updateSettings({ autoResume: v })}
            label={t('settings.autoResume')}
            desc={t('settings.autoResumeDesc')}
          />

          <div className="grid-3 mt-2">
            <Field label={t('settings.dailyGoal')}>
              <input
                className="input"
                type="number"
                min={0}
                max={720}
                step={5}
                value={settings.dailyGoal}
                onChange={(e) => updateSettings({ dailyGoal: clampNum(e.target.value, 0, 720, settings.dailyGoal) })}
              />
            </Field>
            <Field label={t('settings.pomodoroWork')}>
              <input
                className="input"
                type="number"
                min={5}
                max={120}
                step={5}
                value={settings.pomodoroWork}
                onChange={(e) => {
                  const value = clampNum(e.target.value, 5, 120, settings.pomodoroWork)
                  updateSettings({
                    pomodoroWork: value,
                    pomodoroModeMinutes: { ...settings.pomodoroModeMinutes, study: value },
                  })
                }}
              />
            </Field>
            <Field label={t('settings.pomodoroBreak')}>
              <input
                className="input"
                type="number"
                min={1}
                max={60}
                step={1}
                value={settings.pomodoroBreak}
                onChange={(e) => updateSettings({ pomodoroBreak: clampNum(e.target.value, 1, 60, settings.pomodoroBreak) })}
              />
            </Field>
          </div>
        </section>

        {/* YouTube */}
        <section className="panel">
          <div className="section-head">
            <h2>
              <KeyRound size={18} /> {t('settings.youtube')}
            </h2>
            {settings.apiKey && <span className="status done">{t('settings.apiKeySaved')}</span>}
          </div>
          <Field label={t('settings.apiKey')} hint={t('settings.apiKeyDesc')}>
            <div className="input-row">
              <input
                className="input mono"
                dir="ltr"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('settings.apiKeyPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="icon-btn"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? t('common.disable') : t('common.enable')}
                type="button"
              >
                {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
              <button className="btn btn-secondary" onClick={saveKey} disabled={apiKey.trim() === settings.apiKey.trim()}>
                <Save size={16} /> {t('common.save')}
              </button>
            </div>
          </Field>

          <details className="how-to">
            <summary>{t('settings.apiKeyHow')}</summary>
            <p>{t('settings.apiKeySteps')}</p>
          </details>
        </section>

        {/* Data */}
        <section className="panel span-2">
          <div className="section-head">
            <h2>
              <Database size={18} /> {t('settings.data')}
            </h2>
            <span className="muted">{t('settings.storage')}</span>
          </div>
          <p className="muted settings-desc">{t('settings.dataDesc')}</p>

          <div className="storage-card">
            <div className="storage-top">
              <span className="storage-icon">
                <HardDrive size={18} />
              </span>
              <div>
                <strong>{formatBytes(storageBytes)}</strong>
                <span className="muted block">
                  {courses.length} {t('common.courses')} · {lessonCount} {t('common.lessons')} · {noteCount}{' '}
                  {lang === 'ar' ? 'ملاحظة' : 'notes'}
                </span>
              </div>
              <span className="mono muted">{Math.round(storagePercent)}%</span>
            </div>
            <ProgressBar percent={storagePercent} />
          </div>

          <div className="data-actions">
            <button className="btn btn-secondary" onClick={exportBackup}>
              <Download size={16} /> {t('settings.export')}
            </button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> {t('settings.import')}
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
            <span className="field-hint inline-hint">{t('settings.importDesc')}</span>
          </div>
        </section>

        {/* Danger */}
        <section className="panel span-2 danger-panel">
          <div className="section-head">
            <h2>
              <Trash2 size={18} /> {t('settings.danger')}
            </h2>
          </div>
          <p className="muted settings-desc">{t('settings.resetDesc')}</p>
          <div className="danger-row">
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('settings.resetConfirm')}
            />
            <button
              className="btn btn-danger"
              disabled={!canReset}
              onClick={() => {
                resetAll()
                setConfirmText('')
                pushToast(t('settings.resetDone'), 'info')
              }}
            >
              <Trash2 size={16} /> {t('settings.reset')}
            </button>
          </div>
        </section>

        {/* About */}
        <section className="panel span-2 about-panel">
          <div className="section-head">
            <h2>
              <Info size={18} /> {t('settings.about')}
            </h2>
            <span className="version-pill">v{APP_VERSION}</span>
          </div>
          <p className="settings-desc">{t('settings.aboutText')}</p>
        </section>
      </div>
    </div>
  )
}
