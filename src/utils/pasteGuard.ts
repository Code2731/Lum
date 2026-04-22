export interface DangerMatch {
  pattern: string;
  reason: string;
  level: "warn" | "danger";
}

const RULES: Array<{ re: RegExp; reason: string; level: "warn" | "danger" }> = [
  { re: /rm\s+-[^\s]*r[^\s]*f|rm\s+-[^\s]*f[^\s]*r/i, reason: "재귀 강제 삭제 (rm -rf)", level: "danger" },
  { re: /curl\s+.*\|\s*(bash|sh|zsh|python)/i,          reason: "원격 스크립트 직접 실행",       level: "danger" },
  { re: /wget\s+.*\|\s*(bash|sh|zsh|python)/i,          reason: "원격 스크립트 직접 실행",       level: "danger" },
  { re: /dd\s+if=/i,                                     reason: "디스크 직접 쓰기 (dd)",         level: "danger" },
  { re: /mkfs\./i,                                       reason: "파일시스템 포맷",               level: "danger" },
  { re: />\s*\/dev\/(sda|hda|nvme|disk)/i,               reason: "블록 디바이스 덮어쓰기",        level: "danger" },
  { re: /sudo\s+rm/i,                                    reason: "root 권한 삭제",               level: "warn"   },
  { re: /sudo\s+dd/i,                                    reason: "root 권한 디스크 쓰기",         level: "danger" },
  { re: /chmod\s+-R\s+777/i,                             reason: "전체 권한 개방 (777)",          level: "warn"   },
  { re: /:\(\)\s*\{.*:\|:&\}/,                            reason: "Fork Bomb",                   level: "danger" },
];

export function checkPasteDanger(text: string): DangerMatch | null {
  const trimmed = text.trim();
  for (const rule of RULES) {
    if (rule.re.test(trimmed)) {
      return { pattern: trimmed.slice(0, 80), reason: rule.reason, level: rule.level };
    }
  }
  return null;
}
