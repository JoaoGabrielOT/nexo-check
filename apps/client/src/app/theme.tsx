import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLOR = { light: '#f7f5f2', dark: '#16141a' } as const;

// O index.html tem uma meta theme-color por esquema (media). Com tema forçado, as duas recebem a
// cor escolhida; em system, cada uma volta à cor original guardada em data-default.
function syncThemeColor(theme: Theme) {
  for (const meta of document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.default ??= meta.content;
    meta.content = theme === 'system' ? meta.dataset.default : THEME_COLOR[theme];
  }
}

// Estado só em memória; a persistência em `settings` vem com a camada de dados.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const root = document.documentElement;
    syncThemeColor(theme);
    if (theme !== 'system') {
      root.classList.toggle('dark', theme === 'dark');
      return;
    }
    const media = window.matchMedia(DARK_QUERY);
    const apply = () => root.classList.toggle('dark', media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>');
  return ctx;
}
