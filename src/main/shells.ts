import { access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ShellProfile } from '../shared/types';
import { shellKindFromPath } from './shell-integration';

const execFileAsync = promisify(execFile);

async function resolveCommand(command: string): Promise<string | undefined> {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(locator, [command], { windowsHide: true });
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

async function existingPath(candidate: string | undefined): Promise<string | undefined> {
  if (!candidate) return undefined;
  try {
    await access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

export async function discoverShells(): Promise<ShellProfile[]> {
  const candidates: Array<{ id: string; name: string; command?: string; fallback?: string }> = [];
  if (process.platform === 'win32') {
    candidates.push(
      { id: 'pwsh', name: 'PowerShell 7', command: 'pwsh.exe' },
      {
        id: 'windows-powershell',
        name: 'Windows PowerShell',
        command: 'powershell.exe',
        fallback: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      },
    );
  } else {
    candidates.push(
      { id: 'zsh', name: 'Zsh', command: 'zsh' },
      { id: 'bash', name: 'Bash', command: 'bash' },
    );
  }

  const profiles = await Promise.all(candidates.map(async (candidate) => {
    const resolved = await resolveCommand(candidate.command ?? '') ?? await existingPath(candidate.fallback);
    const kind = shellKindFromPath(resolved ?? candidate.command ?? '');
    return {
      id: candidate.id,
      name: candidate.name,
      kind,
      path: resolved ?? candidate.command ?? '',
      args: kind === 'powershell' ? ['-NoLogo'] : [],
      available: Boolean(resolved),
      integration: Boolean(resolved) && ['powershell', 'bash', 'zsh'].includes(kind),
    } satisfies ShellProfile;
  }));

  if (profiles.some((profile) => profile.available)) return profiles;

  const fallback = process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh');
  return [{
    id: 'system-shell',
    name: 'System Shell',
    kind: shellKindFromPath(fallback),
    path: fallback,
    args: [],
    available: true,
    integration: false,
  }];
}
