export interface UpdateInfo {
  version: string;
  notes: string;
}

export interface InstallProgress {
  downloaded: number;
  total: number | null;
}

/**
 * restarting: o app reinicia sozinho (Windows). installing: o instalador do sistema assumiu (Android).
 * needs_permission: falta liberar "instalar apps desta fonte". ready: o APK foi baixado e conferido,
 * mas o app estava em segundo plano; instalar de novo reaproveita o arquivo.
 */
export type InstallOutcome = 'restarting' | 'installing' | 'needs_permission' | 'ready';

/** Versão nova aceita; `asset` é o APK escolhido (Android), guardado pelo store junto com a `info`. */
export interface UpdateCandidate {
  info: UpdateInfo;
  asset?: { name: string; size: number; url: string };
}

export interface UpdaterAdapter {
  /** `null` quando não há versão nova; rejeita se a consulta falhar. Sem estado compartilhado. */
  check(): Promise<UpdateCandidate | null>;
  install(
    candidate: UpdateCandidate,
    onProgress: (p: InstallProgress) => void,
  ): Promise<InstallOutcome>;
}

export type UpdaterState =
  | { status: 'idle' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'downloading'; info: UpdateInfo; progress: InstallProgress }
  | { status: 'needs_permission'; info: UpdateInfo }
  | { status: 'ready'; info: UpdateInfo }
  | { status: 'error'; info: UpdateInfo };

/** Falha da consulta de versão; `status` é o HTTP (0 quando não houve resposta). */
export class UpdateCheckError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Consulta de atualização falhou (${status}).`);
    this.name = 'UpdateCheckError';
    this.status = status;
  }
}
