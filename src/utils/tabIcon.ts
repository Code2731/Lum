import type { TabIcon } from "../hooks/useTabManager";

export interface TabIconFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

// 디렉토리 경로 또는 프로세스명으로 아이콘 추론
export function inferTabIcon(cwd: string): TabIcon {
  // Windows \ 경로를 / 로 정규화해 패턴 통일
  const lower = cwd.toLowerCase().replace(/\\/g, "/");
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

export function getTabIconFlowSummary(cwd: string): TabIconFlowSummary {
  const icon = inferTabIcon(cwd);
  const labelMap: Record<TabIcon, string> = {
    docker: "Docker 작업공간",
    go: "Go 작업공간",
    python: "Python 작업공간",
    java: "Java 작업공간",
    rust: "Rust 작업공간",
    node: "Node 작업공간",
    git: "Git 작업공간",
    terminal: "일반 터미널",
  };

  return {
    primary: "탭 아이콘 추론",
    secondary: labelMap[icon],
    detail: cwd.trim() ? cwd : "작업 경로가 없어 기본 터미널 아이콘을 사용합니다.",
  };
}

export function getOsc7ParseFlowSummary(data: string): TabIconFlowSummary {
  const parsed = parseOsc7(data);
  if (!parsed) {
    return {
      primary: "OSC7 경로 없음",
      secondary: "기존 작업 경로 유지",
      detail: "OSC 7 시퀀스에서 해석 가능한 파일 경로를 찾지 못했습니다.",
    };
  }

  return {
    primary: "OSC7 경로 감지",
    secondary: parsed,
    detail: "터미널이 보고한 최신 작업 디렉터리 경로를 사용할 수 있습니다.",
  };
}
