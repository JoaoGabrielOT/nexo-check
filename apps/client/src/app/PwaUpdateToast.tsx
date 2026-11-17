import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@nexo/ui';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdateToast() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast(t('pwa.updateAvailable'), {
      duration: Infinity,
      action: { label: t('pwa.reload'), onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, t, updateServiceWorker]);

  return null;
}
