/** Pede ao navegador que não apague os dados do app quando faltar espaço. Falhas são ignoradas. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Sem suporte ou negado: o app segue funcionando com o armazenamento padrão.
  }
}
