import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiRequest } from '../../shared/types';
import type { SettingsStore } from '../settings-store';
import { AiManager } from './ai-manager';

describe('AI session isolation', () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it('resolves temporary context by authorized session and ignores renderer-supplied context', async () => {
    const settings = {
      getProfile: vi.fn().mockReturnValue({
        id: 'profile-1',
        name: 'test',
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:9876/v1',
        model: 'test-model',
        timeoutMs: 5_000,
        hasApiKey: true,
        isDefault: true,
      }),
      getSecret: vi.fn().mockReturnValue('secret-key'),
    } as unknown as SettingsStore;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"command":"Get-ChildItem","explanation":"Lists files."}' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const getSessionContext = vi.fn().mockImplementation((sessionId: string) => sessionId === 'session-1'
      ? [{ type: 'command', command: 'Set-Location E:\\work', cwd: 'E:\\work', exitCode: 0, output: '' }]
      : [{ type: 'command', command: 'echo OTHER_SESSION', cwd: 'C:\\', exitCode: 0, output: '' }]);
    const appendSessionContext = vi.fn();
    const manager = new AiManager(settings, () => true, getSessionContext, appendSessionContext);
    const request = {
      requestId: 'request-1',
      sessionId: 'session-1',
      profileId: 'profile-1',
      kind: 'generate',
      shell: 'powershell',
      cwd: 'E:\\work',
      platform: 'win32',
      prompt: 'list files',
      context: [{ command: 'echo RENDERER_CONTEXT', cwd: 'C:\\', exitCode: 0, output: '' }],
    } as AiRequest & { context: unknown[] };

    await manager.request(request);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { messages: Array<{ content: string }> };
    const content = body.messages.map((message) => message.content).join('\n');
    expect(getSessionContext).toHaveBeenCalledWith('session-1');
    expect(content).toContain('Set-Location E:\\work');
    expect(content).not.toContain('OTHER_SESSION');
    expect(content).not.toContain('RENDERER_CONTEXT');
    expect(appendSessionContext).toHaveBeenCalledWith('session-1', expect.objectContaining({
      type: 'ai-exchange',
      userRequest: 'list files',
      suggestedCommand: 'Get-ChildItem',
    }));
  });
});
