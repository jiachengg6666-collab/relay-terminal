import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiRequest, ProviderKind, ProviderProfile } from '../../shared/types';
import { normalizeApiKey, OpenAiStyleAdapter, providerDefaults } from './provider';

const baseRequest: AiRequest = {
  requestId: 'request-1',
  sessionId: 'session-1',
  profileId: 'profile-1',
  kind: 'generate',
  shell: 'bash',
  cwd: '/work',
  platform: 'linux',
  prompt: 'list files',
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
