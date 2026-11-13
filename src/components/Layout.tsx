import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  Flame,
  Home,
  Languages,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sun,
  Timer,
  X,
} from 'lucide-react'
import { useStore } from '../store/store'
import { useUI } from '../store/ui'
import { useI18n, ProgressBar } from './ui'
import { ThemeDock } from './Appearance'
import { computeStreak, formatPrecise, longDate, todaySeconds } from '../lib/utils'

const NAV = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/library', key: 'nav.library', icon: BookOpen },
  { to: '/timer', key: 'nav.timer', icon: Timer },
  { to: '/stats', key: 'nav.stats', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

export function Layout() {
  const { t, lang } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const daily = useStore((s) => s.daily)
  const openImporter = useUI((s) => s.openImporter)
  const setPalette = useUI((s) => s.setPalette)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const collapsed = settings.sidebarCollapsed
  const streak = computeStreak(daily)
  const today = todaySeconds(daily)
  const goalSeconds = Math.max(1, settings.dailyGoal * 60)
  const goalPercent = Math.min(100, (today / goalSeconds) * 100)
  const initial = (settings.name || '?').trim().charAt(0).toUpperCase()

  const toggleTheme = () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
  const toggleLang = () => updateSettings({ lang: lang === 'ar' ? 'en' : 'ar' })

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      {drawerOpen && (
        <button
          className="sidebar-backdrop"
          aria-label={t('sidebar.close')}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <button className="brand" onClick={() => navigate('/')}>
            <span className="brand-mark">ر</span>
            <span className="brand-text">
              <strong>{t('appName')}</strong>
              <small>{t('appTagline')}</small>
            </span>
          </button>
          <button
            className="icon-btn sidebar-toggle hide-mobile"
            onClick={() => updateSettings({ sidebarCollapsed: !collapsed })}
            title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            className="icon-btn sidebar-close show-mobile"
            onClick={() => setDrawerOpen(false)}
            title={t('sidebar.close')}
            aria-label={t('sidebar.close')}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav-list">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={t(key)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">
                <Icon size={19} />
              </span>
              <span className="nav-label">{t(key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-card">
          <div className="streak-head">
            <span className={`flame ${streak > 0 ? 'lit' : ''}`}>
              <Flame size={19} />
            </span>
            <div>
              <strong>{streak}</strong>
              <span>{t('dash.statStreak')}</span>
            </div>
          </div>
          <div className="goal-mini">
            <div className="goal-mini-head">
              <span>{t('dash.goal')}</span>
              <span className="mono">{formatPrecise(today, lang)}</span>
            </div>
            <ProgressBar percent={goalPercent} />
            <div className="goal-mini-sub">
              {goalPercent >= 100 ? t('dash.goalDone') : t('dash.goalRemain', { n: Math.ceil((goalSeconds - today) / 60) })}
            </div>
          </div>
        </div>

        <div className="profile-row">
          <span className="avatar">{initial}</span>
          <div className="profile-info">
            <strong>{settings.name || (lang === 'ar' ? 'ضيف' : 'Guest')}</strong>
            <span>{t('appTagline')}</span>
          </div>
          <button className="icon-btn" onClick={toggleTheme} title={t('settings.theme')}>
            {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-btn menu-btn show-mobile"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('sidebar.open')}
            title={t('sidebar.open')}
          >
            <Menu size={20} />
          </button>
          <div className="topbar-mobile-brand">
            <button className="brand compact" onClick={() => navigate('/')}>
              <span className="brand-mark">ر</span>
              <strong>{t('appName')}</strong>
            </button>
          </div>
          <div className="topbar-date">{longDate(lang)}</div>

          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setPalette(true)}>
              <Search size={16} />
              <span>{t('common.searchPlaceholder')}</span>
              <kbd>⌘K</kbd>
            </button>
            <button className="icon-btn hide-mobile" onClick={toggleLang} title={t('settings.language')}>
              <Languages size={17} />
              <span className="tiny">{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <button className="icon-btn hide-mobile" onClick={toggleTheme} title={t('settings.theme')}>
              {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="btn btn-primary btn-sm hide-mobile" onClick={() => openImporter({ mode: 'create' })}>
              <Plus size={16} /> {t('lib.new')}
            </button>
          </div>
        </header>

        <main className="page">
          <div className="page-inner" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label={t('nav.label')}>
        {NAV.map(({ to, key, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={t(key)}
            className={({ isActive }) => `mobile-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} />
            <span>{t(key)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="mobile-fab"
          onClick={() => openImporter({ mode: 'create' })}
          aria-label={t('lib.new')}
          title={t('lib.new')}
        >
          <Plus size={22} />
        </button>
      </nav>

      <ThemeDock />
    </div>
  )
}
