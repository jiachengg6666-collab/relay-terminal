export type ShellKind = 'powershell' | 'bash' | 'zsh' | 'other';
export type ProviderKind = 'deepseek' | 'dashscope' | 'volcengine' | 'openai-compatible';
export type RiskLevel = 'low' | 'medium' | 'high';
export type AppPlatform = 'win32' | 'darwin' | 'linux';

export interface ShellProfile {
  id: string;
  name: string;
  kind: ShellKind;
  path: string;
  args: string[];
  available: boolean;
  integration: boolean;
}

export interface TerminalCreateOptions {
  sessionId: string;
  shellProfileId: string;
  cols: number;
  rows: number;
  cwd?: string;
}

export interface TerminalSession {
  id: string;
  title: string;
  shellProfileId: string;
  shellKind: ShellKind;
  cwd: string;
  aiEnabled: boolean;
  providerProfileId?: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface TerminalCwdEvent {
  sessionId: string;
  cwd: string;
}

export interface TerminalPromptStateEvent {
  sessionId: string;
  atPrompt: boolean;
}

export interface NaturalLanguageEvent {
  sessionId: string;
  prompt: string;
  cwd: string;
}

export interface CommandFinishedEvent {
  sessionId: string;
  command: string;
  cwd: string;
  exitCode: number;
  output: string;
  interrupted: boolean;
}

export interface ProviderProfile {
  id: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasApiKey: boolean;
  isDefault: boolean;
}

export interface ProviderProfileInput extends Omit<ProviderProfile, 'hasApiKey'> {
  apiKey?: string;
}

export interface FailureContext {
  command: string;
  cwd: string;
  shell: ShellKind;
  platform: AppPlatform;
  exitCode: number;
  output: string;
}

export interface AiRequest {
  requestId: string;
  sessionId: string;
  profileId: string;
  kind: 'generate' | 'correct';
  shell: ShellKind;
  cwd: string;
  platform: AppPlatform;
  prompt?: string;
  failure?: FailureContext;
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

export interface CommandSuggestion {
  requestId: string;
  sessionId: string;
  command: string;
  explanation: string;
  risk: RiskAssessment;
  source: 'generate' | 'correct';
}

export interface AiError {
  requestId: string;
  sessionId: string;
  message: string;
  retryable: boolean;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  aiShortcut: string;
  defaultShellProfileId?: string;
  defaultProviderProfileId?: string;
  profiles: ProviderProfile[];
  secureStorageAvailable: boolean;
}

export interface AppSettingsUpdate {
  theme?: AppSettings['theme'];
  aiShortcut?: string;
  defaultShellProfileId?: string;
  defaultProviderProfileId?: string;
}

export interface SaveProfileResult {
  profile: ProviderProfile;
  persistedSecret: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface Unsubscribe {
  (): void;
}

export interface RelayTerminalApi {
  terminal: {
    listShells(): Promise<ShellProfile[]>;
    create(options: TerminalCreateOptions): Promise<TerminalSession>;
    write(sessionId: string, data: string): void;
    insertCommand(sessionId: string, command: string): void;
    clearInput(sessionId: string): void;
    resize(sessionId: string, cols: number, rows: number): void;
    close(sessionId: string): Promise<void>;
    setAiEnabled(sessionId: string, enabled: boolean, profileId?: string): Promise<void>;
    onData(listener: (event: TerminalDataEvent) => void): Unsubscribe;
    onExit(listener: (event: TerminalExitEvent) => void): Unsubscribe;
    onCwd(listener: (event: TerminalCwdEvent) => void): Unsubscribe;
    onPromptState(listener: (event: TerminalPromptStateEvent) => void): Unsubscribe;
    onNaturalLanguage(listener: (event: NaturalLanguageEvent) => void): Unsubscribe;
    onCommandFinished(listener: (event: CommandFinishedEvent) => void): Unsubscribe;
  };
  ai: {
    request(request: AiRequest): Promise<CommandSuggestion>;
    cancel(requestId: string): void;
    assessRisk(command: string): Promise<RiskAssessment>;
    classifyInput(input: string): Promise<string | undefined>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(update: AppSettingsUpdate): Promise<AppSettings>;
    saveProfile(input: ProviderProfileInput): Promise<SaveProfileResult>;
    deleteProfile(profileId: string): Promise<void>;
    testProfile(input: ProviderProfileInput): Promise<TestConnectionResult>;
  };
}
