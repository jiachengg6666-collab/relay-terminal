import { ipcMain } from 'electron';
import type {
  AiRequest,
  AppSettingsUpdate,
  ProviderProfileInput,
  TerminalCreateOptions,
} from '../shared/types';
import type { AiManager } from './ai/ai-manager';
import type { SettingsStore } from './settings-store';
import type { TerminalManager } from './terminal-manager';
import type { ShellProfile } from '../shared/types';
import { assessCommandRisk } from './security/risk';
import { extractNaturalLanguage } from './natural-language';

export function registerIpc(
  terminalManager: TerminalManager,
  aiManager: AiManager,
  settingsStore: SettingsStore,
  shells: ShellProfile[],
): void {
  const handledChannels = [
    'terminal:list-shells', 'terminal:create', 'terminal:close', 'terminal:set-ai',
    'ai:request', 'ai:assess-risk', 'ai:classify-input', 'settings:get', 'settings:update',
    'settings:save-profile', 'settings:delete-profile', 'settings:test-profile',
  ];
  for (const channel of handledChannels) ipcMain.removeHandler(channel);
  ipcMain.removeAllListeners('terminal:write');
  ipcMain.removeAllListeners('terminal:insert-command');
  ipcMain.removeAllListeners('terminal:clear-input');
  ipcMain.removeAllListeners('terminal:resize');
  ipcMain.removeAllListeners('ai:cancel');

  ipcMain.handle('terminal:list-shells', () => shells);
  ipcMain.handle('terminal:create', (_event, options: TerminalCreateOptions) => terminalManager.create(options));
  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => terminalManager.write(sessionId, data));
  ipcMain.on('terminal:insert-command', (_event, sessionId: string, command: string) => terminalManager.insertCommand(sessionId, command));
  ipcMain.on('terminal:clear-input', (_event, sessionId: string) => terminalManager.clearInput(sessionId));
  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => terminalManager.resize(sessionId, cols, rows));
  ipcMain.handle('terminal:close', (_event, sessionId: string) => terminalManager.close(sessionId));
  ipcMain.handle('terminal:set-ai', (_event, sessionId: string, enabled: boolean, profileId?: string) => {
    terminalManager.setAiEnabled(sessionId, enabled, profileId);
  });

  ipcMain.handle('ai:request', (_event, request: AiRequest) => aiManager.request(request));
  ipcMain.on('ai:cancel', (_event, requestId: string) => aiManager.cancel(requestId));
  ipcMain.handle('ai:assess-risk', (_event, command: string) => assessCommandRisk(command));
  ipcMain.handle('ai:classify-input', (_event, input: string) => extractNaturalLanguage(input));

  ipcMain.handle('settings:get', () => settingsStore.get());
  ipcMain.handle('settings:update', (_event, update: AppSettingsUpdate) => settingsStore.update(update));
  ipcMain.handle('settings:save-profile', (_event, input: ProviderProfileInput) => settingsStore.saveProfile(input));
  ipcMain.handle('settings:delete-profile', (_event, profileId: string) => settingsStore.deleteProfile(profileId));
  ipcMain.handle('settings:test-profile', (_event, input: ProviderProfileInput) => aiManager.testProfile(input));
}
