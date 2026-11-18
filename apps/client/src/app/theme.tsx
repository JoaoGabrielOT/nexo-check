import { useLiveQuery } from 'dexie-react-hooks';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSettings, updateSettings } from '../db';

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
function syncThemeColor(theme: Theme | null) {
  for (const meta of document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.default ??= meta.content;
    meta.content = theme === null || theme === 'system' ? meta.dataset.default : THEME_COLOR[theme];
  }
}

// Espelho mínimo no localStorage: o tema vale já no primeiro render, sem esperar o IndexedDB
// (o index.html faz o mesmo antes do React para não piscar claro). A fonte da verdade é `settings`.
export const THEME_MIRROR_KEY = 'nexo-theme';

export function readThemeMirror(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_MIRROR_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : null;
  } catch {
    return null;
  }
}

function writeThemeMirror(theme: Theme) {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    // armazenamento bloqueado: o tema continua valendo em `settings`
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readThemeMirror() ?? 'system');
  // `settings.theme` é a fonte da verdade: importar um backup ou apagar tudo muda o tema também.
  const stored = useLiveQuery(getSettings, [])?.theme;

  // Ajuste durante a renderização (sem efeito): o estado segue `stored` assim que ele muda.
  const [seen, setSeen] = useState<Theme | undefined>(undefined);
  if (stored !== undefined && stored !== seen) {
    setSeen(stored);
    setThemeState(stored);
  }
  useEffect(() => {
    if (stored !== undefined) writeThemeMirror(stored);
  }, [stored]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeThemeMirror(next);
    updateSettings({ theme: next }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    syncThemeColor(theme);
    // Ao trocar de tema ou desmontar, as metas voltam às cores originais (data-default).
    const restore = () => syncThemeColor(null);
    if (theme !== 'system') {
      root.classList.toggle('dark', theme === 'dark');
      return restore;
    }
    const media = window.matchMedia(DARK_QUERY);
    const apply = () => root.classList.toggle('dark', media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
      restore();
    };
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>');
  return ctx;
}
