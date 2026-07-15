const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]'],
  [/(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s'";]+/gi, '$1[REDACTED]'],
  [/((?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|pwd)\s*[:=]\s*)["']?[^\s'";]+/gi, '$1[REDACTED]'],
  [/\b(sk-[A-Za-z0-9_-]{12,}|ak-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+\/-]{12,})\b/g, '[REDACTED_TOKEN]'],
  [/(https?:\/\/)[^\s\/@:]+:[^\s\/@]+@/gi, '$1[REDACTED]@'],
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
}

export function stripAnsi(value: string): string {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '')
    .replace(/\r/g, '');
}

export function limitOutput(value: string, maxLines = 200, maxBytes = 32 * 1024): string {
  const lines = stripAnsi(value).split('\n').slice(-maxLines).join('\n');
  const encoded = Buffer.from(lines, 'utf8');
  if (encoded.byteLength <= maxBytes) {
    return lines;
  }

  return encoded.subarray(encoded.byteLength - maxBytes).toString('utf8').replace(/^\uFFFD+/, '');
}

export function prepareModelText(value: string): string {
  return redactSecrets(limitOutput(value));
}
