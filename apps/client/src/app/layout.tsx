import { BookOpen, CalendarCheck, ClipboardList, Settings, Sprout, TrendingUp } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { CONSENT_VERSION } from '@nexo/shared';
import { Toaster, Wallpaper, cn } from '@nexo/ui';
import { getSettings } from '../db';
import type { AppSettings } from '../db/schemas';
import { useReminderScheduling } from '../features/settings/RemindersSection';
import { startSyncLoop } from '../sync/engine';
import { PwaUpdateToast } from './PwaUpdateToast';
import { SyncStatusPill } from './SyncStatusPill';
import { useMediaQuery } from './useMediaQuery';

const NAV_ITEMS: {
  to: string;
  key: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { to: '/', key: 'today', icon: CalendarCheck },
  { to: '/registro', key: 'log', icon: ClipboardList },
  { to: '/progresso', key: 'progress', icon: TrendingUp },
  { to: '/aprender', key: 'learn', icon: BookOpen },
  { to: '/projeto', key: 'project', icon: Sprout },
];

// /checkin precisa abrir direto pelo QR da oficina; /admin é independente do app.
const EXEMPT_PREFIXES = ['/checkin', '/admin'];

/** Para onde o app precisa redirecionar com estas configurações (ou `null`). */
function redirectFor(settings: AppSettings, pathname: string): string | null {
  if (pathname.startsWith('/onboarding') || EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }
  if (!settings.onboardingDone) return '/onboarding';
  if (settings.consent?.granted && settings.consent.version < CONSENT_VERSION) {
    return '/onboarding/consentimento';
  }
  return null;
}

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

/**
 * `true` quando há conteúdo sob o cabeçalho, para ele ganhar fundo legível. Observa um sentinela de
 * 1 px no topo do main: com o cabeçalho sticky (no fluxo, antes do main), a área observada começa na
 * base dele (altura arredondada para baixo, para uma altura fracionária não esconder o sentinela no
 * topo), então qualquer rolagem já tira o sentinela. Com o cabeçalho fixed (menu lateral), a área é
 * a tela toda. A medida é refeita quando o cabeçalho muda de tamanho, quando a janela é
 * redimensionada e quando `fixed` muda (troca de breakpoint, que nem sempre muda a altura).
 * Sem listener de scroll. Sem IntersectionObserver, fica `true`: o cabeçalho opaco é sempre legível.
 */
function useContentUnderHeader(
  sentinel: HTMLElement | null,
  header: RefObject<HTMLElement | null>,
  fixed: boolean,
): boolean {
  const supported = typeof IntersectionObserver !== 'undefined';
  const [under, setUnder] = useState(false);
  const [top, setTop] = useState<number | null>(null);

  // Medida antes da pintura, para o observador já nascer com a margem certa.
  useLayoutEffect(() => {
    const el = header.current;
    if (!el) return;
    const measure = () => setTop(fixed ? 0 : Math.floor(el.getBoundingClientRect().height));
    measure();
    window.addEventListener('resize', measure);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      resize?.disconnect();
    };
  }, [header, sentinel, fixed]);

  useEffect(() => {
    if (!sentinel || top === null || !supported) return;
    const observer = new IntersectionObserver(
      ([entry]) => setUnder(entry !== undefined && !entry.isIntersecting),
      // `${-top}px`: com top 0 fica "0px" (e não "-0px").
      { rootMargin: `${-top}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, top, supported]);

  return supported ? under : true;
}

// O fundo fica só no html (index.css). O Wallpaper é fixed z-0 e o conteúdo (header, nav e main)
// fica acima dele com z-10/z-30/z-40, sem z-index negativo. O header é transparente no topo e só
// ganha o fundo (opaco, para nada aparecer através do texto) quando há conteúdo por baixo; a barra
// inferior sempre tem o fundo; sem backdrop-filter. O menu lateral é uma superfície neutra (branco
// no claro, grafite no escuro), nunca navy.
// < 1024 px: barra inferior. ≥ 1024 px: menu lateral e o header vira o topo dele.
export function Layout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const settings = useLiveQuery(getSettings, []);
  useReminderScheduling(settings?.reminders);
  useEffect(() => startSyncLoop(), []);
  const target = settings ? redirectFor(settings, pathname) : null;
  const [confirmed, setConfirmed] = useState<string | null>(null);
  // A consulta ao vivo pode estar um instante atrasada logo após gravar (ex.: fim do onboarding):
  // só redireciona depois de reler as configurações.
  useEffect(() => {
    if (!target) return;
    let alive = true;
    void getSettings().then((fresh) => {
      if (alive && redirectFor(fresh, pathname) === target) setConfirmed(target);
    });
    return () => {
      alive = false;
      setConfirmed(null);
    };
  }, [target, pathname]);
  const headerRef = useRef<HTMLElement>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const inOnboarding = pathname.startsWith('/onboarding');
  // Mesmo limite do lg: com o menu lateral, o header é fixed e fica fora da área do conteúdo.
  const wide = useMediaQuery('(min-width: 1024px)');
  const scrolled = useContentUnderHeader(sentinel, headerRef, wide && !inOnboarding);
  // Sem configurações carregadas não renderiza nada, para não piscar um redirecionamento errado.
  if (!settings) return null;
  if (target) return confirmed === target ? <Navigate to={target} replace /> : null;
  const withNav = !inOnboarding;
  return (
    <>
      <a
        href="#conteudo"
        className={cn(
          'sr-only z-50 rounded-full bg-navy px-4 py-2 font-extrabold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2',
          focusRing,
        )}
      >
        {t('a11y.skipToContent')}
      </a>
      <Wallpaper />
      <header
        ref={headerRef}
        data-scrolled={scrolled}
        className={cn(
          'sticky top-0 z-40 flex items-center justify-between border-b border-transparent px-[6vw] pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 motion-safe:transition-colors',
          scrolled && 'border-border/12 bg-bg',
          withNav &&
            'lg:fixed lg:left-0 lg:w-60 lg:border-transparent lg:bg-transparent lg:pt-6 lg:pr-3 lg:pl-8',
        )}
      >
        <span className="text-lg font-extrabold tracking-[-0.03em]">{t('brand')}</span>
        <div className="flex items-center gap-1">
          <SyncStatusPill className="lg:hidden" />
          <NavLink
            to="/config"
            aria-label={t('nav.settings')}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 min-w-11 items-center justify-center rounded-full text-text transition-colors hover:bg-text/8',
                isActive && 'bg-text/10',
                focusRing,
              )
            }
          >
            <Settings aria-hidden="true" className="size-6" />
          </NavLink>
        </div>
      </header>
      {withNav && (
        <nav
          aria-label={t('a11y.mainNav')}
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border/12 bg-bg px-1 pt-1.5 pb-[env(safe-area-inset-bottom)]',
            'lg:inset-y-0 lg:right-auto lg:w-60 lg:flex-col lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:border-border/10 lg:bg-surface lg:px-4 lg:pt-24',
          )}
        >
          {NAV_ITEMS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'mb-1 flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-0.5 text-[11px] leading-tight transition-colors',
                  'lg:mb-0 lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-2.5 lg:text-sm',
                  isActive
                    ? 'font-extrabold text-text lg:bg-navy lg:text-[#f7f5f2] lg:dark:bg-lav2 lg:dark:text-navy'
                    : 'font-semibold text-muted hover:text-text lg:hover:bg-text/6',
                  focusRing,
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    data-nav-icon
                    data-active={isActive}
                    className={cn(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors lg:h-auto lg:w-auto',
                      isActive &&
                        'max-lg:bg-navy max-lg:text-[#f7f5f2] max-lg:dark:bg-lav2 max-lg:dark:text-navy',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  {t(`nav.${key}`)}
                </>
              )}
            </NavLink>
          ))}
          <SyncStatusPill className="hidden self-start lg:mt-auto lg:mb-6 lg:ml-4 lg:inline-flex" />
        </nav>
      )}
      <main
        id="conteudo"
        tabIndex={-1}
        className={cn(
          'relative z-10 px-[6vw] pt-3 pb-12 outline-none',
          withNav &&
            'pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pt-12 lg:pr-14 lg:pb-14 lg:pl-[calc(15rem+3rem)] xl:pr-16',
        )}
      >
        <div ref={setSentinel} aria-hidden="true" className="h-px" />
        <Outlet />
      </main>
      <Toaster />
      <PwaUpdateToast />
    </>
  );
}
