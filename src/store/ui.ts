import { create } from 'zustand'

interface ImporterOptions {
  mode: 'create' | 'add'
  courseId?: string
  parentId?: string | null
  initialLink?: string
  initialTab?: 'playlist' | 'links' | 'manual'
}

interface UIStore {
  importer: ImporterOptions | null
  shareCourseId: string | null
  paletteOpen: boolean
  openImporter: (opts: ImporterOptions) => void
  closeImporter: () => void
  openShare: (courseId: string) => void
  closeShare: () => void
  setPalette: (open: boolean) => void
}

export const useUI = create<UIStore>((set) => ({
  importer: null,
  shareCourseId: null,
  paletteOpen: false,
  openImporter: (opts) => set({ importer: opts }),
  closeImporter: () => set({ importer: null }),
  openShare: (courseId) => set({ shareCourseId: courseId }),
  closeShare: () => set({ shareCourseId: null }),
  setPalette: (open) => set({ paletteOpen: open }),
}))
