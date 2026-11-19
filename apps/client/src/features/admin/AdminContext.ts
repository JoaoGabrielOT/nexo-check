import { createContext, useContext } from 'react';

export interface AdminSession {
  token: string;
  /** Trata um erro de API: em 401 limpa o token e volta ao login; devolve `true` se tratou. */
  expireOn401: (e: unknown) => boolean;
}

export const AdminContext = createContext<AdminSession | null>(null);

export function useAdmin(): AdminSession {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin fora do painel admin');
  return ctx;
}
