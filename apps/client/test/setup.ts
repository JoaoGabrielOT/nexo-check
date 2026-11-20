import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import i18n from '../src/i18n';

// Chave de tradução ausente aparece crua na tela (ex.: "project.next.inicialTitle"):
// qualquer teste que renderize uma chave inexistente falha.
const missingKeys = new Set<string>();
i18n.options.saveMissing = true;
i18n.on('missingKey', (_lngs: readonly string[], _ns: string, key: string) => {
  missingKeys.add(key);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  if (missingKeys.size > 0) {
    const keys = [...missingKeys].join(', ');
    missingKeys.clear();
    throw new Error(`Chaves de tradução ausentes: ${keys}`);
  }
});

// jsdom não implementa matchMedia: stub controlável pelos testes.
type Listener = (e: MediaQueryListEvent) => void;
export const mediaControl = {
  matches: false,
  listeners: new Set<Listener>(),
  add: vi.fn((_type: string, l: Listener) => void mediaControl.listeners.add(l)),
  remove: vi.fn((_type: string, l: Listener) => void mediaControl.listeners.delete(l)),
  reset() {
    this.matches = false;
    this.listeners.clear();
    this.add.mockClear();
    this.remove.mockClear();
  },
};

window.matchMedia = (query: string) =>
  ({
    get matches() {
      return mediaControl.matches;
    },
    media: query,
    addEventListener: mediaControl.add,
    removeEventListener: mediaControl.remove,
  }) as unknown as MediaQueryList;

beforeEach(() => mediaControl.reset());
