import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Dices,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { useStore } from '../store/store'
import { useI18n } from './ui'
import {
  ACCENT_PALETTES,
  DEFAULT_PALETTE,
  deriveAccent2,
  normalizeHex,
  randomAccent,
  type AccentPalette,
} from '../lib/theme'

function PaletteChip({
  palette,
  active,
  onSelect,
}: {
  palette: AccentPalette
  active: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className={`palette-chip ${active ? 'active' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
      title={t(`appearance.palette.${palette.id}`)}
    >
      <span
        className="palette-dot"
        style={{ background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})` }}
      >
        {active && <Check size={15} strokeWidth={3} />}
      </span>
      <span className="palette-name">{t(`appearance.palette.${palette.id}`)}</span>
    </button>
  )
}

export function ColorStudio({ showTheme = false }: { showTheme?: boolean }) {
  const { t } = useI18n()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [hex, setHex] = useState((settings.accentColor || DEFAULT_PALETTE.accent).toUpperCase())
  const [invalid, setInvalid] = useState(false)
  const colorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHex((settings.accentColor || DEFAULT_PALETTE.accent).toUpperCase())
    setInvalid(false)
  }, [settings.accentColor])

  const applyPalette = (palette: AccentPalette) => {
    updateSettings({
      accentPalette: palette.id,
      accentColor: palette.accent,
      accentColor2: palette.accent2,
    })
  }

  const applyCustom = (value: string) => {
    const color = normalizeHex(value)
    if (!color) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setHex(color.toUpperCase())
    updateSettings({
      accentPalette: 'custom',
      accentColor: color,
      accentColor2: deriveAccent2(color),
    })
  }

  const commitHex = () => {
    if (normalizeHex(hex)) applyCustom(hex)
    else setInvalid(true)
  }

  const pickRandom = () => applyCustom(randomAccent())

  return (
    <div className="color-studio">
      {showTheme && (
        <div className="studio-block">
          <span className="studio-label">{t('settings.theme')}</span>
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
        </div>
      )}

      <div className="studio-block">
        <div className="studio-head">
          <span className="studio-label">
            <Sparkles size={14} /> {t('appearance.colors')}
          </span>
          <button type="button" className="studio-reset" onClick={() => applyPalette(DEFAULT_PALETTE)}>
            <RotateCcw size={13} /> {t('appearance.reset')}
          </button>
        </div>
        <p className="studio-hint">{t('appearance.colorsHint')}</p>

        <div className="palette-grid">
          {ACCENT_PALETTES.map((palette) => (
            <PaletteChip
              key={palette.id}
              palette={palette}
              active={settings.accentPalette === palette.id}
              onSelect={() => applyPalette(palette)}
            />
          ))}
        </div>
      </div>

      <div className="studio-block">
        <span className="studio-label">{t('appearance.custom')}</span>
        <div className={`custom-color-row ${invalid ? 'invalid' : ''}`}>
          <button
            type="button"
            className="color-swatch"
            style={{ background: settings.accentColor }}
            onClick={() => colorRef.current?.click()}
            title={t('appearance.pickColor')}
            aria-label={t('appearance.pickColor')}
          >
            <span className="color-swatch-ring" />
          </button>
          <input
            ref={colorRef}
            type="color"
            className="native-color"
            value={normalizeHex(settings.accentColor) || DEFAULT_PALETTE.accent}
            onChange={(e) => applyCustom(e.target.value)}
            aria-label={t('appearance.pickColor')}
          />
          <div className="hex-field">
            <span className="hex-hash">#</span>
            <input
              className="input mono"
              value={hex.replace('#', '')}
              maxLength={7}
              spellCheck={false}
              dir="ltr"
              aria-label={t('appearance.hex')}
              onChange={(e) => {
                setInvalid(false)
                setHex(`#${e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase()}`)
              }}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitHex()
              }}
            />
          </div>
          <button type="button" className="icon-btn" onClick={pickRandom} title={t('appearance.random')}>
            <Dices size={17} />
          </button>
        </div>
        {invalid && <p className="studio-error">{t('appearance.invalidHex')}</p>}
      </div>

      <div className="studio-preview">
        <span className="studio-preview-glow" />
        <div className="studio-preview-head">
          <span className="studio-preview-avatar">ر</span>
          <div>
            <strong>{t('appearance.previewTitle')}</strong>
            <span>{t('appearance.previewMeta')}</span>
          </div>
          <span className="studio-preview-dot" />
        </div>
        <div className="studio-preview-bar">
          <span />
        </div>
        <div className="studio-preview-foot">
          <span>{t('appearance.preview')}</span>
          <span className="studio-preview-action">{t('appearance.previewBtn')}</span>
        </div>
      </div>
    </div>
  )
}

export function ThemeDock() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`theme-dock ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('appearance.open')}
        title={t('appearance.open')}
      >
        <Palette size={19} />
        <span className="theme-dock-dots" aria-hidden="true">
          <i className="dot-a" />
          <i className="dot-b" />
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="theme-dock-backdrop"
            onClick={() => setOpen(false)}
            aria-label={t('common.close')}
          />
          <aside className="theme-drawer" role="dialog" aria-modal="true" aria-label={t('appearance.title')}>
            <header className="theme-drawer-head">
              <div>
                <strong>
                  <Palette size={18} /> {t('appearance.title')}
                </strong>
                <span>{t('appearance.subtitle')}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X size={18} />
              </button>
            </header>
            <div className="theme-drawer-body">
              <ColorStudio showTheme />
            </div>
          </aside>
        </>
      )}
    </>
  )
}
