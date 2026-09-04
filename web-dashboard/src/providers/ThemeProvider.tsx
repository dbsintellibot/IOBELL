import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getTheme } from '@/lib/themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { schoolId } = useAuth()

  // Fetch theme preference
  const { data } = useQuery({
    queryKey: ['school_theme', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('theme_color, theme_mode')
        .eq('id', schoolId)
        .single()
      
      if (error) return { theme_color: 'slate', theme_mode: 'dark' }
      return {
        theme_color: data.theme_color || 'slate',
        theme_mode: data.theme_mode || 'dark',
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  useEffect(() => {
    const root = window.document.documentElement

    let effectiveName = 'slate'
    let effectiveMode: 'dark' | 'light' | 'grey' = 'dark'

    if (schoolId && data?.theme_color) {
      effectiveName = data.theme_color
      effectiveMode = (data.theme_mode as 'dark' | 'light' | 'grey') || 'dark'
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('autobell_theme', effectiveName)
        window.localStorage.setItem('autobell_theme_mode', effectiveMode)
      }
    } else if (!schoolId && typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('autobell_theme')
      if (stored) {
        effectiveName = stored
      }
      const storedMode = window.localStorage.getItem('autobell_theme_mode') as
        | 'dark'
        | 'light'
        | 'grey'
        | null
      if (storedMode === 'dark' || storedMode === 'light' || storedMode === 'grey') {
        effectiveMode = storedMode
      }
    }

    const theme = getTheme(effectiveName)
    const cssVars: Record<string, string> = { ...theme.cssVars }

    if (effectiveName === 'slate' && effectiveMode === 'dark') {
      cssVars['--primary'] = '210 40% 98%'
      cssVars['--primary-foreground'] = '222.2 47.4% 11.2%'
      cssVars['--ring'] = '212.7 26.8% 83.9%'
    }

    root.classList.remove('dark', 'grey')
    if (effectiveMode === 'dark') {
      root.classList.add('dark')
    } else if (effectiveMode === 'grey') {
      root.classList.add('grey')
    }

    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [schoolId, data?.theme_color, data?.theme_mode])

  return <>{children}</>
}
