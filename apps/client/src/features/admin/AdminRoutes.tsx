import { LogOut } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@nexo/ui';
import { ApiError } from '../../sync/http';
import { AdminContext } from './AdminContext';
import { clearToken, getToken } from './adminApi';
import { IndicatorsPage } from './IndicatorsPage';
import { LoginPage } from './LoginPage';
import { SessionsPage } from './SessionsPage';

export default function AdminRoutes() {
  const { t } = useTranslation();
  const [token, setTokenState] = useState<string | null>(getToken);

  const signOut = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);
  const expireOn401 = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        signOut();
        return true;
      }
      return false;
    },
    [signOut],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-8">
      <header className="flex items-center justify-between gap-3">
        <span className="text-lg font-extrabold tracking-[-0.03em]">{t('admin.brand')}</span>
        {token && (
          <Button variant="ghost" onClick={signOut}>
            <LogOut aria-hidden="true" className="size-5" />
            {t('admin.logout')}
          </Button>
        )}
      </header>
      {token ? (
        <AdminContext.Provider value={{ token, expireOn401 }}>
          <Tabs defaultValue="indicators" className="flex flex-col gap-6">
            <TabsList aria-label={t('admin.tabs.label')}>
              <TabsTrigger value="indicators">{t('admin.tabs.indicators')}</TabsTrigger>
              <TabsTrigger value="sessions">{t('admin.tabs.sessions')}</TabsTrigger>
            </TabsList>
            <TabsContent value="indicators" className="mt-0">
              <IndicatorsPage />
            </TabsContent>
            <TabsContent value="sessions" className="mt-0">
              <SessionsPage />
            </TabsContent>
          </Tabs>
        </AdminContext.Provider>
      ) : (
        <LoginPage onLogin={setTokenState} />
      )}
    </div>
  );
}
