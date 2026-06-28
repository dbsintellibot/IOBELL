export const themes = [
  {
    name: 'slate',
    label: 'Slate (Default)',
    activeColor: 'bg-slate-950',
    cssVars: {
      '--primary': '222.2 47.4% 11.2%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '222.2 84% 4.9%',
    },
  },
  {
    name: 'blue',
    label: 'Blue',
    activeColor: 'bg-blue-600',
    cssVars: {
      '--primary': '221.2 83.2% 53.3%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '221.2 83.2% 53.3%',
    },
  },
  {
    name: 'red',
    label: 'Red',
    activeColor: 'bg-red-600',
    cssVars: {
      '--primary': '0 72.2% 50.6%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '0 72.2% 50.6%',
    },
  },
  {
    name: 'green',
    label: 'Green',
    activeColor: 'bg-green-600',
    cssVars: {
      '--primary': '142.1 76.2% 36.3%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '142.1 76.2% 36.3%',
    },
  },
  {
    name: 'violet',
    label: 'Violet',
    activeColor: 'bg-violet-600',
    cssVars: {
      '--primary': '262.1 83.3% 57.8%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '262.1 83.3% 57.8%',
    },
  },
  {
    name: 'orange',
    label: 'Orange',
    activeColor: 'bg-orange-500',
    cssVars: {
      '--primary': '24.6 95% 53.1%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '24.6 95% 53.1%',
    },
  },
] as const

export type ThemeName = typeof themes[number]['name']

export function getTheme(name: string) {
  return themes.find(t => t.name === name) || themes[0]
}
