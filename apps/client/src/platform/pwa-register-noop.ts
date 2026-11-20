// Stub do módulo virtual do vite-plugin-pwa nos apps nativos (sem service worker).
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  };
}
