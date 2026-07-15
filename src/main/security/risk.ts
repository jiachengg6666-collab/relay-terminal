import type { RiskAssessment } from '../../shared/types';

const HIGH_RISK_RULES: Array<[RegExp, string]> = [
  [/\b(?:rm|unlink)\b[^\n]*(?:-rf|-fr|--recursive)/i, 'Recursively deletes files'],
  [/\bRemove-Item\b[^\n]*(?:-Recurse|-Force)/i, 'Recursively or forcibly deletes files'],
  [/\b(?:format|mkfs(?:\.[a-z0-9]+)?|diskpart|fdisk|parted)\b/i, 'Modifies a disk or filesystem'],
  [/\bdd\b[^\n]*\bof=\s*\/(?:dev|disk)/i, 'Writes directly to a block device'],
  [/\b(?:shutdown|reboot|poweroff|Restart-Computer|Stop-Computer)\b/i, 'Stops or restarts the machine'],
  [/\b(?:sudo|doas|runas)\b/i, 'Requests elevated privileges'],
  [/\b(?:Set-ExecutionPolicy\s+Unrestricted|chmod\s+-R\s+777)\b/i, 'Weakens a system security boundary'],
  [/\b(?:DROP\s+(?:DATABASE|TABLE)|TRUNCATE\s+TABLE)\b/i, 'Permanently removes database data'],
];

const MEDIUM_RISK_RULES: Array<[RegExp, string]> = [
  [/\b(?:rm|rmdir|del|erase|Remove-Item)\b/i, 'Deletes files'],
  [/(?:^|\s)(?:>|>>|Set-Content|Out-File)\s*[^|]/i, 'Writes or overwrites a file'],
  [/\b(?:kill|pkill|taskkill|Stop-Process)\b/i, 'Stops a process'],
  [/\b(?:npm|pnpm|yarn|pip|brew|apt|dnf|yum)\b[^\n]*\b(?:install|remove|uninstall|upgrade)\b/i, 'Changes installed software'],
  [/\b(?:git\s+(?:reset|clean|push\s+--force)|docker\s+(?:rm|rmi|system\s+prune))\b/i, 'Can discard project or container data'],
];

export function assessCommandRisk(command: string): RiskAssessment {
  const highReasons = HIGH_RISK_RULES.filter(([pattern]) => pattern.test(command)).map(([, reason]) => reason);
  if (highReasons.length > 0) {
    return { level: 'high', reasons: [...new Set(highReasons)] };
  }

  const mediumReasons = MEDIUM_RISK_RULES.filter(([pattern]) => pattern.test(command)).map(([, reason]) => reason);
  if (mediumReasons.length > 0) {
    return { level: 'medium', reasons: [...new Set(mediumReasons)] };
  }

  return { level: 'low', reasons: [] };
}
