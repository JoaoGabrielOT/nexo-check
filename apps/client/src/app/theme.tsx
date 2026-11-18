import { useLiveQuery } from 'dexie-react-hooks';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from '@nexo/ui';
import { getSettings, updateSettings } from '../db';
import i18n from '../i18n';

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
  const [followed, setFollowed] = useState<Theme>(() => readThemeMirror() ?? 'system');
  // Escolha da pessoa ainda não confirmada em `settings`: enquanto existir, vale no lugar de `stored`.
  const [pending, setPending] = useState<{ value: Theme; id: number } | null>(null);
  // Cada escolha recebe um número; só o resultado da gravação mais recente conta (lido só em callbacks).
  const lastWriteId = useRef(0);
  // `settings.theme` é a fonte da verdade: importar um backup ou apagar tudo muda o tema também.
  const stored = useLiveQuery(getSettings, [])?.theme;
  // Ajuste durante a renderização (sem efeito): `followed` acompanha `stored` quando ele muda.
  const [seen, setSeen] = useState<Theme | undefined>(undefined);
  if (stored !== undefined && stored !== seen) {
    setSeen(stored);
    setFollowed(stored);
  }
  const theme = pending ? pending.value : followed;

  useEffect(() => {
    writeThemeMirror(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    const id = ++lastWriteId.current;
    setPending({ value: next, id });
    const settle = (resync: boolean) => {
      if (id !== lastWriteId.current) return; // uma escolha mais nova já assumiu
      setPending(null);
      if (!resync) {
        // Gravou: `next` já é o salvo, sem voltar ao valor antigo até a consulta reemitir.
        setFollowed(next);
        return;
      }
      toast(i18n.t('errors.generic'));
      // Não gravou: volta ao que está salvo; se nem isso for possível, fica no último valor conhecido.
      getSettings()
        .then((s) => {
          if (id === lastWriteId.current) setFollowed(s.theme);
        })
        .catch(() => undefined);
    };
    updateSettings({ theme: next }).then(
      () => settle(false),
      () => settle(true),
    );
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
