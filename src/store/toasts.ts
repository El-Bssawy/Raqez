import { create } from 'zustand'
import type { ToastItem } from '../types'
import { uid } from '../lib/utils'

interface ToastStore {
  toasts: ToastItem[]
  push: (message: string, type?: ToastItem['type']) => void
  remove: (id: string) => void
}

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, type = 'success') => {
    const id = uid('t_')
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3600)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (message: string, type: ToastItem['type'] = 'success') =>
  useToasts.getState().push(message, type)
