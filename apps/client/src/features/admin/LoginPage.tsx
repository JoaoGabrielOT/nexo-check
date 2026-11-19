import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, PageHeader, Tile } from '@nexo/ui';
import { ApiError } from '../../sync/http';
import { adminLogin, setToken } from './adminApi';

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const token = await adminLogin(password);
      setToken(token);
      onLogin(token);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        t(
          status === 401
            ? 'admin.login.wrong'
            : status === 429
              ? 'admin.login.tooMany'
              : 'admin.login.failed',
        ),
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6">
      <PageHeader title={t('admin.login.title')} meta={t('admin.login.hint')} />
      <Tile tone="plain" label={t('admin.login.title')}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="admin-password" className="font-extrabold">
              {t('admin.login.password')}
            </label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <Alert role="alert">{error}</Alert>}
          <Button type="submit" disabled={busy || password.length === 0}>
            {t('admin.login.submit')}
          </Button>
        </form>
      </Tile>
    </div>
  );
}
