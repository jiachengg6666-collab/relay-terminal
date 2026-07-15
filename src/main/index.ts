import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { AiManager } from './ai/ai-manager';
import { registerIpc } from './ipc';
import { SettingsStore } from './settings-store';
import { discoverShells } from './shells';
import { TerminalManager } from './terminal-manager';

let mainWindow: BrowserWindow | undefined;
let terminalManager: TerminalManager | undefined;

if (process.env.RELAY_USER_DATA_DIR) {
  app.setPath('userData', process.env.RELAY_USER_DATA_DIR);
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

async function createWindow(): Promise<void> {
  const settingsStore = new SettingsStore();
  await settingsStore.load();
  const shells = await discoverShells();
  const integrationDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'shell')
    : path.join(__dirname, '..', '..', 'resources', 'shell');

  let aiManager: AiManager;
  terminalManager = new TerminalManager(
    shells,
    integrationDirectory,
    {
      onData: (event) => send('terminal:data', event),
      onExit: (event) => send('terminal:exit', event),
      onCwd: (event) => send('terminal:cwd', event),
      onPromptState: (event) => send('terminal:prompt-state', event),
      onNaturalLanguage: (event) => send('terminal:natural-language', event),
      onCommandFinished: (event) => send('terminal:command-finished', event),
    },
    (sessionId) => aiManager?.cancelSession(sessionId),
    (profileId) => Boolean(settingsStore.getProfile(profileId)?.hasApiKey),
  );
  aiManager = new AiManager(settingsStore, (sessionId, profileId) => terminalManager?.isAiAuthorized(sessionId, profileId) ?? false);
  registerIpc(terminalManager, aiManager, settingsStore, shells);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#101214',
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 14, y: 14 },
    } : { titleBarStyle: 'default' as const }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) await mainWindow.loadURL(devServerUrl);
  else await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));

  mainWindow.on('closed', () => {
    terminalManager?.closeAll();
    mainWindow = undefined;
  });
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  terminalManager?.closeAll();
  if (process.platform !== 'darwin') app.quit();
});
