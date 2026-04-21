import type { TabIcon } from "../hooks/useTabManager";

// 디렉토리 경로 또는 프로세스명으로 아이콘 추론
export function inferTabIcon(cwd: string): TabIcon {
  const lower = cwd.toLowerCase();
  if (lower.includes("docker") || lower.includes("container")) return "docker";
  if (lower.includes("go/") || lower.includes("/go") || lower.endsWith("/go")) return "go";
  if (lower.includes("python") || lower.includes("venv") || lower.includes(".py")) return "python";
  if (lower.includes("java") || lower.includes("maven") || lower.includes("gradle")) return "java";
  if (lower.includes("rust") || lower.includes("cargo") || lower.includes(".rs")) return "rust";
  if (lower.includes("node") || lower.includes("npm") || lower.includes(".js") || lower.includes(".ts")) return "node";
  if (lower.includes(".git") || lower.includes("git/")) return "git";
  return "terminal";
}

// OSC 7 시퀀스에서 경로 추출
// 형식: \x1b]7;file://hostname/path\x07 또는 \x1b]7;file://hostname/path\x1b\\
export function parseOsc7(data: string): string | null {
  const m = data.match(/\x1b\]7;file:\/\/[^/]*([^\x07\x1b]+)[\x07\x1b]/);
  return m ? decodeURIComponent(m[1]) : null;
}
