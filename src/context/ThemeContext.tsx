/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { SupportedLocale } from '@/types/domain.types'

export type ThemeMode = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (next: ThemeMode) => void
  toggleTheme: () => void
  highContrast: boolean
  setHighContrast: (enabled: boolean) => void
  locale: SupportedLocale
  setLocale: (next: SupportedLocale) => void
}

const THEME_STORAGE_KEY = 'devproof_ui_theme_v1'
const CONTRAST_STORAGE_KEY = 'devproof_ui_high_contrast_v1'
const LOCALE_STORAGE_KEY = 'devproof_ui_locale_v1'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function resolveInitialHighContrast(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CONTRAST_STORAGE_KEY) === 'true'
}

function resolveInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en-US'
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (
    saved === 'en-US' ||
    saved === 'en-GB' ||
    saved === 'de-DE' ||
    saved === 'fr-FR' ||
    saved === 'ja-JP'
  ) {
    return saved
  }
  return 'en-US'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(resolveInitialTheme)
  const [highContrast, setHighContrastState] = useState<boolean>(resolveInitialHighContrast)
  const [locale, setLocaleState] = useState<SupportedLocale>(resolveInitialLocale)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('high-contrast', highContrast)
    window.localStorage.setItem(CONTRAST_STORAGE_KEY, String(highContrast))
  }, [highContrast])

  useEffect(() => {
    const root = document.documentElement
    root.lang = locale
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  function setTheme(next: ThemeMode) {
    setThemeState(next)
  }

  function toggleTheme() {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  function setHighContrast(enabled: boolean) {
    setHighContrastState(enabled)
  }

  function setLocale(next: SupportedLocale) {
    setLocaleState(next)
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        highContrast,
        setHighContrast,
        locale,
        setLocale,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return ctx
}
