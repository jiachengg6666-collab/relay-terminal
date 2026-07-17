import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKind, ProviderProfile } from '../../shared/types';
import { normalizeApiKey, OpenAiStyleAdapter, providerDefaults, type ProviderAiRequest } from './provider';

const baseRequest: ProviderAiRequest = {
  requestId: 'request-1',
  sessionId: 'session-1',
  profileId: 'profile-1',
  kind: 'generate',
  shell: 'bash',
  cwd: '/work',
  platform: 'linux',
  prompt: 'list files',
  context: [],
};

function profile(provider: ProviderKind): ProviderProfile {
  return {
    id: 'profile-1',
    name: provider,
    provider,
    baseUrl: providerDefaults[provider].baseUrl || 'http://localhost:9876/v1',
    model: providerDefaults[provider].model || 'test-model',
    timeoutMs: 5_000,
    hasApiKey: true,
    isDefault: true,
  };
}

describe('provider adapters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects masked or non-ASCII API key values before making a request', () => {
    expect(() => normalizeApiKey('  real-key-123  ')).not.toThrow();
    expect(normalizeApiKey('  real-key-123  ')).toBe('real-key-123');
    expect(() => normalizeApiKey('sk-live-••••')).toThrow(/masked value/i);
  });

  it.each<ProviderKind>(['deepseek', 'dashscope', 'volcengine', 'openai-compatible'])('maps %s to a chat completions request', async (provider) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"command":"ls -la","explanation":"Lists files."}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenAiStyleAdapter(profile(provider), 'secret-key');
    const result = await adapter.generateCommand(baseRequest, new AbortController().signal);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/chat\/completions$/);
    expect(options.headers.Authorization).toBe('Bearer secret-key');
    expect(JSON.parse(options.body).model).toBe(profile(provider).model);
    expect(result.command).toBe('ls -la');
    expect(result.risk.level).toBe('low');
  });

  it('rejects malformed model output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'run whatever' } }],
    }), { status: 200 })));
    const adapter = new OpenAiStyleAdapter(profile('openai-compatible'), 'secret-key');
    await expect(adapter.generateCommand(baseRequest, new AbortController().signal)).rejects.toThrow(/structured command suggestion/i);
  });

  it('sends only redacted temporary context from the current terminal session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"command":"Get-ChildItem","explanation":"Continues in the same directory."}' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenAiStyleAdapter(profile('openai-compatible'), 'secret-key');
    await adapter.generateCommand({
      ...baseRequest,
      shell: 'powershell',
      platform: 'win32',
      context: [{
        type: 'command',
        command: 'Set-Location E:\\work',
        cwd: 'E:\\work',
        exitCode: 0,
        output: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      }, {
        type: 'ai-exchange',
        cwd: 'E:\\work',
        userRequest: 'remember the build directory',
        suggestedCommand: 'Get-Location',
        explanation: 'Uses the current directory.',
      }],
    }, new AbortController().signal);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { messages: Array<{ content: string }> };
    const prompt = body.messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('Set-Location E:\\work');
    expect(prompt).toContain('remember the build directory');
    expect(prompt).toContain('Previous AI exchange');
    expect(prompt).toContain('temporary context');
    expect(prompt).toContain('untrusted reference data');
    expect(prompt).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(prompt).toContain('[REDACTED]');
  });

  it('cancels an in-flight request', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const adapter = new OpenAiStyleAdapter(profile('openai-compatible'), 'secret-key');
    const request = adapter.generateCommand(baseRequest, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow();
  });
});
