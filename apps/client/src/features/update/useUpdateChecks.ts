import { useEffect } from 'react';
import { UPDATE_CHECK_INTERVAL_MS } from '@nexo/shared';
import { checkForUpdates, getActiveUpdater } from '../../platform/updater/store';

/** Verifica ao abrir e a cada 6 h; só onde há atualizador (nativo). Falhas ficam em silêncio. */
export function useUpdateChecks(): void {
  useEffect(() => {
    if (!getActiveUpdater()) return;
    void checkForUpdates();
    const id = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
