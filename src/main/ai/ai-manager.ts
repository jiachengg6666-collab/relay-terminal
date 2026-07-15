import type { AiRequest, CommandSuggestion, ProviderProfileInput, TestConnectionResult } from '../../shared/types';
import type { SettingsStore } from '../settings-store';
import { OpenAiStyleAdapter } from './provider';

interface ActiveRequest {
  sessionId: string;
  controller: AbortController;
  adapter: OpenAiStyleAdapter;
}

export class AiManager {
  private requests = new Map<string, ActiveRequest>();

  constructor(
    private readonly settings: SettingsStore,
    private readonly isSessionAuthorized: (sessionId: string, profileId: string) => boolean,
  ) {}

  async request(request: AiRequest): Promise<CommandSuggestion> {
    if (!this.isSessionAuthorized(request.sessionId, request.profileId)) {
      throw new Error('AI is not enabled for this terminal session.');
    }
    if (this.requests.has(request.requestId)) throw new Error('Duplicate AI request ID.');
    const profile = this.settings.getProfile(request.profileId);
    const apiKey = this.settings.getSecret(request.profileId);
    if (!profile || !apiKey) throw new Error('The selected model profile is missing or has no API key.');

    const controller = new AbortController();
    const adapter = new OpenAiStyleAdapter(profile, apiKey);
    this.requests.set(request.requestId, { sessionId: request.sessionId, controller, adapter });
    try {
      return request.kind === 'generate'
        ? await adapter.generateCommand(request, controller.signal)
        : await adapter.correctFailure(request, controller.signal);
    } finally {
      this.requests.delete(request.requestId);
    }
  }

  cancel(requestId: string): void {
    const active = this.requests.get(requestId);
    active?.controller.abort();
    active?.adapter.cancel();
    this.requests.delete(requestId);
  }

  cancelSession(sessionId: string): void {
    for (const [requestId, request] of this.requests) {
      if (request.sessionId === sessionId) this.cancel(requestId);
    }
  }

  async testProfile(input: ProviderProfileInput): Promise<TestConnectionResult> {
    const existingSecret = this.settings.getSecret(input.id);
    const apiKey = input.apiKey || existingSecret;
    if (!apiKey) return { ok: false, message: 'API key is required.' };
    const adapter = new OpenAiStyleAdapter({ ...input, hasApiKey: true }, apiKey);
    const controller = new AbortController();
    try {
      return await adapter.testConnection(controller.signal);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection failed.' };
    }
  }
}
