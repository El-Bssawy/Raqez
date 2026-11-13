import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertTriangle, Info, ChevronDown } from 'lucide-react'
import { useToasts } from '../store/toasts'
import { useStore } from '../store/store'
import { translate } from '../lib/i18n'
import type { Lang } from '../types'

export function useI18n() {
  const lang = useStore((s) => s.settings.lang) as Lang
  return {
    lang,
    dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
  }
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closable = true,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, closable])

  if (!open) return null
  return createPortal(
    <div className={`modal-overlay ${closable ? '' : 'modal-locked'}`} onMouseDown={(e) => {
      if (e.target === e.currentTarget && closable) onClose()
    }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        {(title || closable) && (
          <div className="modal-head">
            <div>
              {title && <h2 className="modal-title">{title}</h2>}
              {subtitle && <p className="modal-sub">{subtitle}</p>}
            </div>
            {closable && (
              <button className="icon-btn" onClick={onClose} aria-label="close">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  desc,
  confirmLabel,
  cancelLabel,
  danger = true,
  children,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  desc?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="row gap-2">
          {danger && <AlertTriangle size={20} className="text-danger" />} {title}
        </span>
      }
      subtitle={desc}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {cancelLabel || t('confirm.no')}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel || t('confirm.yes')}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Toaster                                                             */
/* ------------------------------------------------------------------ */

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const remove = useToasts((s) => s.remove)
  return (
    <div className="toaster">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => remove(toast.id)}>
          <span className="toast-icon">
            {toast.type === 'success' ? <Check size={16} /> : toast.type === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function ProgressRing({
  percent,
  size = 54,
  stroke = 5,
  color,
  track,
  children,
}: {
  percent: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const p = Math.max(0, Math.min(100, percent || 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track || 'var(--ring-track)'} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color || 'url(#accentGrad)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * p) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }}
        />
        <defs>
          <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
      </svg>
      {children != null && <div className="ring-label">{children}</div>}
    </div>
  )
}

export function ProgressBar({ percent, color, className = '' }: { percent: number; color?: string; className?: string }) {
  return (
    <div className={`progress ${className}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label?: ReactNode
  hint?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  desc?: ReactNode
}) {
  return (
    <label className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {desc && <span className="toggle-desc">{desc}</span>}
      </div>
      <button
        type="button"
        className={`switch ${checked ? 'on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-dot" />
      </button>
    </label>
  )
}

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  className?: string
}) {
  return (
    <div className={`select ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

export function KebabMenu({ items, align = 'end' }: { items: MenuItem[]; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="kebab" ref={ref}>
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
        aria-label="menu"
      >
        <span className="dots">⋮</span>
      </button>
      {open && (
        <div className={`menu ${align === 'start' ? 'menu-start' : ''}`} onClick={(e) => e.stopPropagation()}>
          {items.map((item, i) => (
            <button
              key={i}
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Video cover                                                         */
/* ------------------------------------------------------------------ */

export function CourseCover({
  thumbnail,
  emoji,
  color,
  title,
  className = '',
  children,
}: {
  thumbnail?: string
  emoji: string
  color: string
  title: string
  className?: string
  children?: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`cover ${className}`} style={{ background: `linear-gradient(135deg, ${color}33, ${color}0a)` }}>
      {thumbnail && !broken ? (
        <img src={thumbnail} alt={title} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="cover-fallback" style={{ background: `radial-gradient(circle at 30% 20%, ${color}55, transparent 65%)` }}>
          <span className="cover-emoji">{emoji}</span>
        </div>
      )}
      <div className="cover-shade" />
      {children}
    </div>
  )
}
