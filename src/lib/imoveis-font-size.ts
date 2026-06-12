export const FONT_SIZE_MIN = 10
export const FONT_SIZE_MAX = 20
export const FONT_SIZE_DEFAULT = 12

const STORAGE_KEY = 'imoveis-font-size'

export function clampFontSize(value: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))
}

export function loadFontSize(): number {
  if (typeof window === 'undefined') return FONT_SIZE_DEFAULT
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return FONT_SIZE_DEFAULT
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? clampFontSize(n) : FONT_SIZE_DEFAULT
}

export function saveFontSize(value: number): void {
  localStorage.setItem(STORAGE_KEY, String(clampFontSize(value)))
}
