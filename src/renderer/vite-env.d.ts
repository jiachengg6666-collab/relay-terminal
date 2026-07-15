/// <reference types="vite/client" />

import type { RelayTerminalApi } from '../shared/types';

declare global {
  interface Window {
    relayTerminal: RelayTerminalApi;
  }
}

export {};
