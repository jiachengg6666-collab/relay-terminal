import { z } from 'zod';
import type {
  AiRequest,
  CommandSuggestion,
  ProviderProfile,
  TestConnectionResult,
} from '../../shared/types';
import { prepareModelText, redactSecrets } from '../security/redaction';
import { assessCommandRisk } from '../security/risk';
import type { TerminalContextEntry } from './session-context';

export interface ProviderAiRequest extends AiRequest {
  context: TerminalContextEntry[];
}

const responseSchema = z.object({
  command: z.string().min(1).max(16_384),
  explanation: z.string().min(1).max(4_096),
});

export interface ProviderAdapter {
  generateCommand(request: ProviderAiRequest, signal: AbortSignal): Promise<CommandSuggestion>;
  correctFailure(request: ProviderAiRequest, signal: AbortSignal): Promise<CommandSuggestion>;
  testConnection(signal: AbortSignal): Promise<TestConnectionResult>;
  cancel(): void;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export function normalizeApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (!normalized) throw new Error('API key is required.');
  if (!/^[\x21-\x7E]+$/.test(normalized)) {
    throw new Error('API key contains unsupported characters. Paste the original key instead of a masked value such as bullets.');
  }
  return normalized;
}

function endpointFor(profile: ProviderProfile): string {
  const base = profile.baseUrl.replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

function parseJsonContent(content: string): z.infer<typeof responseSchema> {
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('The model did not return a structured command suggestion.');
    parsed = JSON.parse(withoutFence.slice(start, end + 1));
  }
  const result = responseSchema.safeParse(parsed);
  if (!result.success) throw new Error('The model returned an invalid command suggestion.');
  return result.data;
}

function systemPrompt(request: ProviderAiRequest): string {
  return [
    'You generate exactly one shell command for an interactive terminal.',
    `Target shell: ${request.shell}. Platform: ${request.platform}. Current directory: ${redactSecrets(request.cwd)}.`,
    'Return JSON only with exactly two string fields: command and explanation.',
    'Do not use Markdown. Do not include multiple alternatives. Do not execute anything.',
    'Preserve the user language in the explanation. Make the command valid for the target shell.',
    'Use recent terminal context only when it is relevant to the current request.',
  ].join('\n');
}

function recentContext(request: ProviderAiRequest): string {
  const entries = request.failure
    ? request.context.filter((entry, index) => index !== request.context.length - 1
      || entry.command !== request.failure?.command
      || entry.cwd !== request.failure.cwd
      || entry.exitCode !== request.failure.exitCode)
    : request.context;
  if (entries.length === 0) return '';
  return [
    'Recent commands from this terminal tab (temporary context):',
    ...entries.map((entry, index) => [
      `[${index + 1}] Directory: ${prepareModelText(entry.cwd)}`,
      `Command: ${prepareModelText(entry.command)}`,
      `Exit code: ${entry.exitCode}`,
      entry.output ? `Output:\n${prepareModelText(entry.output)}` : 'Output: (empty)',
    ].join('\n')),
  ].join('\n\n');
}

function userPrompt(request: ProviderAiRequest): string {
  const context = recentContext(request);
  if (request.kind === 'generate') {
    return [context, 'Current request:', prepareModelText(request.prompt ?? '')].filter(Boolean).join('\n\n');
  }
  if (!request.failure) throw new Error('Missing failure context.');
  return [
    context,
    'Correct this failed command with one replacement command.',
    `Command: ${redactSecrets(request.failure.command)}`,
    `Exit code: ${request.failure.exitCode}`,
    `Output:\n${prepareModelText(request.failure.output)}`,
  ].filter(Boolean).join('\n\n');
}

export class OpenAiStyleAdapter implements ProviderAdapter {
  private currentController?: AbortController;
  private readonly apiKey: string;

  constructor(
    private readonly profile: ProviderProfile,
    apiKey: string,
  ) {
    this.apiKey = normalizeApiKey(apiKey);
  }

  generateCommand(request: ProviderAiRequest, signal: AbortSignal): Promise<CommandSuggestion> {
    return this.requestSuggestion(request, signal);
  }

  correctFailure(request: ProviderAiRequest, signal: AbortSignal): Promise<CommandSuggestion> {
    return this.requestSuggestion(request, signal);
  }

  async testConnection(signal: AbortSignal): Promise<TestConnectionResult> {
    const response = await this.chat([
      { role: 'system', content: 'Return JSON only: {"command":"echo ok","explanation":"ok"}' },
      { role: 'user', content: 'Connection test.' },
    ], signal, 64);
    parseJsonContent(response);
    return { ok: true, message: 'Connection succeeded.' };
  }

  cancel(): void {
    this.currentController?.abort();
  }

  private async requestSuggestion(request: ProviderAiRequest, signal: AbortSignal): Promise<CommandSuggestion> {
    const content = await this.chat([
      { role: 'system', content: systemPrompt(request) },
      { role: 'user', content: userPrompt(request) },
    ], signal, 768);
    const parsed = parseJsonContent(content);
    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      command: parsed.command.trim(),
      explanation: parsed.explanation.trim(),
      risk: assessCommandRisk(parsed.command),
      source: request.kind,
    };
  }

  private async chat(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    externalSignal: AbortSignal,
    maxTokens: number,
  ): Promise<string> {
    const controller = new AbortController();
    this.currentController = controller;
    const timeout = setTimeout(() => controller.abort(), this.profile.timeoutMs);
    const abortFromExternal = () => controller.abort();
    externalSignal.addEventListener('abort', abortFromExternal, { once: true });

    try {
      const response = await fetch(endpointFor(this.profile), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.profile.model,
          messages,
          temperature: 0.1,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      const body = await response.json() as ChatResponse;
      if (!response.ok) {
        const message = body.error?.message ?? `Provider request failed with HTTP ${response.status}.`;
        throw new Error(redactSecrets(message));
      }
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error('The provider returned an empty response.');
      return content;
    } finally {
      clearTimeout(timeout);
      externalSignal.removeEventListener('abort', abortFromExternal);
      if (this.currentController === controller) this.currentController = undefined;
    }
  }
}

export const providerDefaults: Record<ProviderProfile['provider'], { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  dashscope: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  volcengine: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  'openai-compatible': { baseUrl: '', model: '' },
};
