/**
 * Accent palette helpers.
 *
 * The whole UI is tinted from two CSS variables (`--accent` and `--accent-2`),
 * so a palette is just a pair of hex colors. Everything else (soft fills,
 * borders, gradients, glows) is derived in CSS with `color-mix()`.
 */

export interface AccentPalette {
  id: string
  accent: string
  accent2: string
}

export const ACCENT_PALETTES: AccentPalette[] = [
  { id: 'lagoon', accent: '#14b8a6', accent2: '#38bdf8' },
  { id: 'aurora', accent: '#8b5cf6', accent2: '#22d3ee' },
  { id: 'bloom', accent: '#a855f7', accent2: '#ec4899' },
  { id: 'ocean', accent: '#3b82f6', accent2: '#06b6d4' },
  { id: 'forest', accent: '#22c55e', accent2: '#84cc16' },
  { id: 'sunset', accent: '#f97316', accent2: '#f43f5e' },
  { id: 'gold', accent: '#fbbf24', accent2: '#f97316' },
  { id: 'rose', accent: '#f43f5e', accent2: '#c084fc' },
  { id: 'slate', accent: '#94a3b8', accent2: '#e2e8f0' },
]

export const DEFAULT_PALETTE = ACCENT_PALETTES[0]

export function paletteById(id: string): AccentPalette | undefined {
  return ACCENT_PALETTES.find((p) => p.id === id)
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Accepts `abc`, `#abc`, `aabbcc`, `#AABBCC` and returns `#aabbcc` or null. */
export function normalizeHex(value: string): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(HEX_RE)
  if (!match) return null
  let hex = match[1].toLowerCase()
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return `#${hex}`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function hexToRgb(hex: string): [number, number, number] {
  const safe = normalizeHex(hex) || DEFAULT_PALETTE.accent
  return [
    parseInt(safe.slice(1, 3), 16),
    parseInt(safe.slice(3, 5), 16),
    parseInt(safe.slice(5, 7), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** h: 0..360, s: 0..100, l: 0..100 */
export function hexToHsl(hex: string): [number, number, number] {
  const [r255, g255, b255] = hexToRgb(hex)
  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, Math.round(l * 100)]
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return [h, clamp(s * 100, 0, 100), clamp(l * 100, 0, 100)]
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 100) / 100
  const lig = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lig - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Second palette color for a custom primary: an analogous hue, kept vivid. */
export function deriveAccent2(hex: string): string {
  const [h, s, l] = hexToHsl(hex)
  let hue = h + 40
  // Avoid the murky yellow-green band; shift warm colors toward rose instead.
  if (hue >= 45 && hue <= 85) hue = h + 300
  return hslToHex(hue, clamp(Math.max(s, 55), 55, 92), clamp(l, 48, 64))
}

export function randomAccent(): string {
  return hslToHex(Math.random() * 360, 62 + Math.random() * 28, 52 + Math.random() * 12)
}

/** Linear RGB mix. `weight` is how much of `b` to use (0..1). */
export function mixHex(a: string, b: string, weight = 0.5): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(
    ar + (br - ar) * weight,
    ag + (bg - ag) * weight,
    ab + (bb - ab) * weight,
  )
}

/** Slightly deepen a color so it keeps contrast on the light theme. */
export function forLightTheme(hex: string, amount = 0.22): string {
  return mixHex(hex, '#000000', amount)
}

/** Readable accent pair for the current theme. */
export function resolveAccent(accent: string, accent2: string, theme: 'dark' | 'light') {
  const safeAccent = normalizeHex(accent) || DEFAULT_PALETTE.accent
  const safeAccent2 = normalizeHex(accent2) || deriveAccent2(safeAccent)
  if (theme === 'dark') return { accent: safeAccent, accent2: safeAccent2 }
  return {
    accent: forLightTheme(safeAccent, 0.18),
    accent2: forLightTheme(safeAccent2, 0.26),
  }
}
