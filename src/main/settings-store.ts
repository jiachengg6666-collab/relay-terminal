import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AppSettings,
  AppSettingsUpdate,
  ProviderProfile,
  ProviderProfileInput,
  SaveProfileResult,
} from '../shared/types';
import { normalizeApiKey } from './ai/provider';

interface StoredProfile extends Omit<ProviderProfile, 'hasApiKey'> {}

interface StoredSettings {
  theme: AppSettings['theme'];
  aiShortcut: string;
  defaultShellProfileId?: string;
  defaultProviderProfileId?: string;
  profiles: StoredProfile[];
}

const DEFAULT_SETTINGS: StoredSettings = {
  theme: 'dark',
  aiShortcut: 'CommandOrControl+Shift+G',
  profiles: [],
};

export class SettingsStore {
  private settings: StoredSettings = { ...DEFAULT_SETTINGS };
  private encryptedSecrets: Record<string, string> = {};
  private sessionSecrets = new Map<string, string>();
  private readonly settingsPath: string;
  private readonly secretsPath: string;

  constructor() {
    const dataDirectory = app.getPath('userData');
    this.settingsPath = path.join(dataDirectory, 'settings.json');
    this.secretsPath = path.join(dataDirectory, 'secrets.json');
  }

  async load(): Promise<void> {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.settingsPath, 'utf8')) as Partial<StoredSettings>;
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS, profiles: [] };
    }

    try {
      this.encryptedSecrets = JSON.parse(await readFile(this.secretsPath, 'utf8')) as Record<string, string>;
    } catch {
      this.encryptedSecrets = {};
    }
  }

  isSecureStorageAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return true;
  }

  get(): AppSettings {
    const secureStorageAvailable = this.isSecureStorageAvailable();
    const profiles = this.settings.profiles.map((profile) => ({
      ...profile,
      hasApiKey: this.hasUsableSecret(profile.id),
    }));
    return { ...this.settings, profiles, secureStorageAvailable };
  }

  async update(update: AppSettingsUpdate): Promise<AppSettings> {
    this.settings = { ...this.settings, ...update };
    await this.persistSettings();
    return this.get();
  }

  async saveProfile(input: ProviderProfileInput): Promise<SaveProfileResult> {
    const normalizedApiKey = input.apiKey ? normalizeApiKey(input.apiKey) : undefined;
    const profile: StoredProfile = {
      id: input.id,
      name: input.name.trim(),
      provider: input.provider,
      baseUrl: input.baseUrl.trim().replace(/\/$/, ''),
      model: input.model.trim(),
      timeoutMs: Math.min(Math.max(input.timeoutMs, 5_000), 120_000),
      isDefault: input.isDefault,
    };

    const existingIndex = this.settings.profiles.findIndex((item) => item.id === profile.id);
    if (profile.isDefault) {
      this.settings.profiles = this.settings.profiles.map((item) => ({ ...item, isDefault: false }));
      this.settings.defaultProviderProfileId = profile.id;
    }
    if (existingIndex >= 0) this.settings.profiles[existingIndex] = profile;
    else this.settings.profiles.push(profile);

    let persistedSecret = this.isSecureStorageAvailable();
    if (normalizedApiKey) {
      if (persistedSecret) {
        this.encryptedSecrets[profile.id] = safeStorage.encryptString(normalizedApiKey).toString('base64');
        this.sessionSecrets.delete(profile.id);
        await this.persistSecrets();
      } else {
        this.sessionSecrets.set(profile.id, normalizedApiKey);
      }
    }

    if (!this.settings.defaultProviderProfileId) {
      this.settings.defaultProviderProfileId = profile.id;
      profile.isDefault = true;
    }
    await this.persistSettings();
    return { profile: { ...profile, hasApiKey: this.hasUsableSecret(profile.id) }, persistedSecret };
  }

  async deleteProfile(profileId: string): Promise<void> {
    this.settings.profiles = this.settings.profiles.filter((profile) => profile.id !== profileId);
    delete this.encryptedSecrets[profileId];
    this.sessionSecrets.delete(profileId);
    if (this.settings.defaultProviderProfileId === profileId) {
      this.settings.defaultProviderProfileId = this.settings.profiles[0]?.id;
      this.settings.profiles = this.settings.profiles.map((profile, index) => ({ ...profile, isDefault: index === 0 }));
    }
    await Promise.all([this.persistSettings(), this.persistSecrets()]);
  }

  getProfile(profileId: string): ProviderProfile | undefined {
    const profile = this.settings.profiles.find((item) => item.id === profileId);
    return profile ? { ...profile, hasApiKey: this.hasUsableSecret(profile.id) } : undefined;
  }

  getSecret(profileId: string): string | undefined {
    const sessionSecret = this.sessionSecrets.get(profileId);
    if (sessionSecret) return sessionSecret;
    const encrypted = this.encryptedSecrets[profileId];
    if (!encrypted || !this.isSecureStorageAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      return undefined;
    }
  }

  private hasSecret(profileId: string): boolean {
    return this.sessionSecrets.has(profileId) || (this.isSecureStorageAvailable() && Boolean(this.encryptedSecrets[profileId]));
  }

  private hasUsableSecret(profileId: string): boolean {
    if (!this.hasSecret(profileId)) return false;
    try {
      normalizeApiKey(this.getSecret(profileId) ?? '');
      return true;
    } catch {
      return false;
    }
  }

  private async persistSettings(): Promise<void> {
    await writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  private async persistSecrets(): Promise<void> {
    if (!this.isSecureStorageAvailable()) return;
    await writeFile(this.secretsPath, JSON.stringify(this.encryptedSecrets, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
}
