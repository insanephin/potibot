import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark'

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem('theme')
  } catch {
    return null
  }
}

function getInitialTheme(): Theme {
  const stored = readStoredTheme()
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      return
    }
  }, [theme])

  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label="테마 전환"
      onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

export { ThemeToggle }
