import { describe, expect, it, vi } from 'vitest';
import type { SettingsStore } from '../settings-store';
import { AiManager } from './ai-manager';

describe('AI session isolation', () => {
  it('rejects a request before reading credentials when the session is not authorized', async () => {
    const settings = {
      getProfile: vi.fn(),
      getSecret: vi.fn(),
    } as unknown as SettingsStore;
    const manager = new AiManager(settings, () => false);
    await expect(manager.request({
      requestId: 'request-1',
      sessionId: 'session-1',
      profileId: 'profile-1',
      kind: 'generate',
      shell: 'bash',
      cwd: '/work',
      platform: 'linux',
      prompt: 'list files',
    })).rejects.toThrow(/not enabled/i);
    expect(settings.getProfile).not.toHaveBeenCalled();
    expect(settings.getSecret).not.toHaveBeenCalled();
  });
});
