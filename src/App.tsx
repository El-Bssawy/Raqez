import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Toaster } from './components/ui'
import { LessonsImporter } from './components/LessonsImporter'
import { ShareModal } from './components/ShareModal'
import { CommandPalette } from './components/CommandPalette'
import { Onboarding } from './components/Onboarding'
import { useStore } from './store/store'
import { useUI } from './store/ui'
import { resolveAccent } from './lib/theme'
import Home from './pages/Home'
import LibraryPage from './pages/Library'
import CoursePage from './pages/CoursePage'
import WatchPage from './pages/Watch'
import StatsPage from './pages/Stats'
import SettingsPage from './pages/Settings'
import TimerPage from './pages/Timer'
import ImportSharePage from './pages/ImportShare'

export default function App() {
  const settings = useStore((s) => s.settings)
  const setPalette = useUI((s) => s.setPalette)
  const location = useLocation()

  /* Language / direction / theme on the document root */
  useEffect(() => {
    const root = document.documentElement
    root.lang = settings.lang
    root.dir = settings.lang === 'ar' ? 'rtl' : 'ltr'
    root.dataset.theme = settings.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', settings.theme === 'dark' ? '#08090d' : '#f6f7fb')
  }, [settings.lang, settings.theme])

  /* Accent palette → CSS variables (soft fills, borders and glows derive from these) */
  useEffect(() => {
    const root = document.documentElement
    const { accent, accent2 } = resolveAccent(
      settings.accentColor,
      settings.accentColor2,
      settings.theme,
    )
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-2', accent2)
  }, [settings.accentColor, settings.accentColor2, settings.theme])

  /* Global command palette shortcut */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  /* Scroll to top when navigating between pages */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/course/:id" element={<CoursePage />} />
          <Route path="/watch/:courseId/:lessonId" element={<WatchPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<ImportSharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      <LessonsImporter />
      <ShareModal />
      <CommandPalette />
      <Onboarding />
      <Toaster />
    </>
  )
}
