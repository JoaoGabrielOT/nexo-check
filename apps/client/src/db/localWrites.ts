type Listener = () => void;
const listeners = new Set<Listener>();

/** Avisa o motor de sincronização de que há algo novo para enviar. */
export function notifyLocalWrite(): void {
  for (const l of [...listeners]) l();
}

export function onLocalWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
