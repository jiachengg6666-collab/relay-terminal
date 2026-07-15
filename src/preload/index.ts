import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiRequest,
  AppSettingsUpdate,
  CommandFinishedEvent,
  NaturalLanguageEvent,
  ProviderProfileInput,
  RelayTerminalApi,
  TerminalCreateOptions,
  TerminalCwdEvent,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalPromptStateEvent,
} from '../shared/types';

function eventSubscription<T>(channel: string, listener: (event: T) => void): () => void {
  const handler = (_electronEvent: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: RelayTerminalApi = {
  terminal: {
    listShells: () => ipcRenderer.invoke('terminal:list-shells'),
    create: (options: TerminalCreateOptions) => ipcRenderer.invoke('terminal:create', options),
    write: (sessionId, data) => ipcRenderer.send('terminal:write', sessionId, data),
    insertCommand: (sessionId, command) => ipcRenderer.send('terminal:insert-command', sessionId, command),
    clearInput: (sessionId) => ipcRenderer.send('terminal:clear-input', sessionId),
    resize: (sessionId, cols, rows) => ipcRenderer.send('terminal:resize', sessionId, cols, rows),
    close: (sessionId) => ipcRenderer.invoke('terminal:close', sessionId),
    setAiEnabled: (sessionId, enabled, profileId) => ipcRenderer.invoke('terminal:set-ai', sessionId, enabled, profileId),
    onData: (listener: (event: TerminalDataEvent) => void) => eventSubscription('terminal:data', listener),
    onExit: (listener: (event: TerminalExitEvent) => void) => eventSubscription('terminal:exit', listener),
    onCwd: (listener: (event: TerminalCwdEvent) => void) => eventSubscription('terminal:cwd', listener),
    onPromptState: (listener: (event: TerminalPromptStateEvent) => void) => eventSubscription('terminal:prompt-state', listener),
    onNaturalLanguage: (listener: (event: NaturalLanguageEvent) => void) => eventSubscription('terminal:natural-language', listener),
    onCommandFinished: (listener: (event: CommandFinishedEvent) => void) => eventSubscription('terminal:command-finished', listener),
  },
  ai: {
    request: (request: AiRequest) => ipcRenderer.invoke('ai:request', request),
    cancel: (requestId) => ipcRenderer.send('ai:cancel', requestId),
    assessRisk: (command) => ipcRenderer.invoke('ai:assess-risk', command),
    classifyInput: (input) => ipcRenderer.invoke('ai:classify-input', input),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (update: AppSettingsUpdate) => ipcRenderer.invoke('settings:update', update),
    saveProfile: (input: ProviderProfileInput) => ipcRenderer.invoke('settings:save-profile', input),
    deleteProfile: (profileId) => ipcRenderer.invoke('settings:delete-profile', profileId),
    testProfile: (input: ProviderProfileInput) => ipcRenderer.invoke('settings:test-profile', input),
  },
};

contextBridge.exposeInMainWorld('relayTerminal', api);
