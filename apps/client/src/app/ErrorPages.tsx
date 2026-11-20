import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { PageHeader, buttonVariants, cn } from '@nexo/ui';

/** Tela amigável sem hooks do roteador: serve também fora dele (falha antes de o app montar). */
export function ErrorScreen({ kind }: { kind: 'error' | 'notFound' }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 pt-6 sm:gap-8">
      <PageHeader title={t(`errors.${kind}.title`)} />
      <p className="max-w-prose text-lg font-medium">{t(`errors.${kind}.body`)}</p>
      {/* Link comum (recarrega a página): sai de qualquer estado quebrado do app. */}
      <a href="/" className={cn(buttonVariants(), 'min-h-14 self-start px-8 text-base')}>
        {t('errors.backHome')}
      </a>
    </div>
  );
}

/** `errorElement` das rotas: erro ao renderizar ou carregar uma tela. */
export function RouteErrorPage() {
  const error = useRouteError();
  console.error('Erro na rota', error);
  return <ErrorScreen kind="error" />;
}

export function NotFoundPage() {
  return <ErrorScreen kind="notFound" />;
}
