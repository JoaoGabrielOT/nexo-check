// Stub do módulo virtual do vite-plugin-pwa para os testes (jsdom não tem service worker).
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  };
}
