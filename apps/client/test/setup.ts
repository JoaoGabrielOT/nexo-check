import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import '../src/i18n';

afterEach(cleanup);

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
