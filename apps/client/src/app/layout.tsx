import { BookOpen, CalendarCheck, ClipboardList, Settings, Sprout, TrendingUp } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { CONSENT_VERSION } from '@nexo/shared';
import { Toaster, Wallpaper, cn } from '@nexo/ui';
import { getSettings } from '../db';
import { PwaUpdateToast } from './PwaUpdateToast';

const NAV_ITEMS: { to: string; key: string; icon: ComponentType<{ className?: string }> }[] = [
  { to: '/', key: 'today', icon: CalendarCheck },
  { to: '/registro', key: 'log', icon: ClipboardList },
  { to: '/progresso', key: 'progress', icon: TrendingUp },
  { to: '/aprender', key: 'learn', icon: BookOpen },
  { to: '/projeto', key: 'project', icon: Sprout },
];

// /checkin precisa abrir direto pelo QR da oficina; /admin é independente do app.
const EXEMPT_PREFIXES = ['/checkin', '/admin'];

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

// O fundo fica só no html (index.css). O Wallpaper é fixed z-0 e o
// conteúdo (header, nav e main) fica acima dele com z-10/z-30, sem z-index negativo.
export function Layout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const settings = useLiveQuery(getSettings, []);
  // Sem configurações carregadas não renderiza nada, para não piscar um redirecionamento errado.
  if (!settings) return null;
  const inOnboarding = pathname.startsWith('/onboarding');
  if (!inOnboarding && !EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!settings.onboardingDone) return <Navigate to="/onboarding" replace />;
    if (settings.consent?.granted && settings.consent.version < CONSENT_VERSION) {
      return <Navigate to="/onboarding/consentimento" replace />;
    }
  }
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
      <header className="sticky top-0 z-30 flex items-center justify-between bg-bg px-[6vw] py-4 lg:pl-60">
        <span className="text-lg font-extrabold tracking-tight">{t('brand')}</span>
        <NavLink
          to="/config"
          aria-label={t('nav.settings')}
          className={cn(
            'flex min-h-11 min-w-11 items-center justify-center rounded-full text-navy transition-colors dark:text-text',
            focusRing,
          )}
        >
          <Settings aria-hidden="true" className="size-6" />
        </NavLink>
      </header>
      {!inOnboarding && (
        <nav
          aria-label={t('a11y.mainNav')}
          className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t-2 border-border bg-bg px-2 py-1 lg:inset-y-0 lg:right-auto lg:w-56 lg:flex-col lg:justify-start lg:gap-2 lg:border-t-0 lg:border-r-2 lg:px-4 lg:pt-24"
        >
          {NAV_ITEMS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1 text-xs font-semibold text-navy transition-colors lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-sm dark:text-text',
                  focusRing,
                  isActive && 'bg-navy text-white dark:bg-lav2 dark:text-navy',
                )
              }
            >
              <Icon aria-hidden="true" className="size-5" />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      )}
      <main
        id="conteudo"
        tabIndex={-1}
        className="relative z-10 px-[6vw] pt-4 pb-28 outline-none lg:pb-10 lg:pl-60"
      >
        <Outlet />
      </main>
      <Toaster />
      <PwaUpdateToast />
    </>
  );
}
