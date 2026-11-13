import { useState } from 'react'
import { ArrowRight, ListVideo, NotebookPen, Sparkles, Timer, Play } from 'lucide-react'
import { useStore } from '../store/store'
import { useI18n, Modal } from './ui'

export function Onboarding() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const { t } = useI18n()
  const [name, setName] = useState(settings.name)

  if (settings.onboarded) return null

  const finish = () => {
    updateSettings({ onboarded: true, name: name.trim() })
  }

  return (
    <Modal
      open
      onClose={finish}
      closable={false}
      size="md"
      footer={
        <>
          <button className="btn btn-ghost" onClick={finish}>
            {t('onboard.skip')}
          </button>
          <button className="btn btn-primary" onClick={finish}>
            <Play size={16} /> {t('onboard.start')}
          </button>
        </>
      }
    >
      <div className="onboarding">
        <div className="onboarding-logo">
          <span>ر</span>
        </div>
        <h1>{t('onboard.title')}</h1>
        <p className="muted">{t('onboard.desc')}</p>

        <div className="onboarding-lang">
          <span className="muted">{t('onboard.lang')}</span>
          <div className="segmented">
            <button
              className={settings.lang === 'ar' ? 'active' : ''}
              onClick={() => updateSettings({ lang: 'ar' })}
            >
              العربية
            </button>
            <button
              className={settings.lang === 'en' ? 'active' : ''}
              onClick={() => updateSettings({ lang: 'en' })}
            >
              English
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field-label">{t('onboard.name')}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboard.namePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finish()
            }}
          />
        </div>

        <div className="onboarding-features">
          <div>
            <ListVideo size={17} /> <span>{t('onboard.feature1')}</span>
          </div>
          <div>
            <NotebookPen size={17} /> <span>{t('onboard.feature2')}</span>
          </div>
          <div>
            <Sparkles size={17} /> <span>{t('onboard.feature3')}</span>
          </div>
          <div>
            <Timer size={17} /> <span>{t('onboard.feature4')}</span>
          </div>
        </div>

        <div className="onboarding-privacy">
          <ArrowRight size={14} className="rtl-flip" />
          <span>{t('settings.privacyText')}</span>
        </div>
      </div>
    </Modal>
  )
}
