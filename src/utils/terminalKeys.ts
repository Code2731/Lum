/**
 * 터미널 키 분류기 — Ctrl+C/V/F 동작을 xterm 의존 없이 단위 테스트 가능하게 분리.
 *
 * 기존엔 attachCustomKeyEventHandler 안에 inline으로 짜여서 회귀 검증 어려웠음.
 * KeyAction 결과에 따라 호출자가 적절한 동작 수행:
 *  - copy: navigator.clipboard.writeText(selection) + xterm.clearSelection
 *  - paste: navigator.clipboard.readText → 위험/SmartPaste 검사 → PTY
 *  - search: 검색창 열기
 *  - passthrough: xterm 기본 동작 (Ctrl+C SIGINT 등)
 */
export type KeyAction =
  | { kind: "copy"; selection: string }
  | { kind: "paste" }
  | { kind: "search" }
  | { kind: "passthrough" };

export interface TerminalKeyFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function classifyTerminalKey(
  e: { type: string; key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  selection: string,
): KeyAction {
  if (e.type !== "keydown") return { kind: "passthrough" };
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return { kind: "passthrough" };
  const key = e.key.toLowerCase();

  if (key === "f") return { kind: "search" };
  if (key === "c") {
    return selection ? { kind: "copy", selection } : { kind: "passthrough" };
  }
  if (key === "v") return { kind: "paste" };

  return { kind: "passthrough" };
}

export function getTerminalKeyFlowSummary(kind: KeyAction["kind"]): TerminalKeyFlowSummary {
  switch (kind) {
    case "copy":
      return {
        badges: ["선택 영역 있음", "복사 동작", "터미널 포커스 유지"],
        helper: "선택된 출력이 있을 때만 복사로 전환하고, 그렇지 않으면 기본 Ctrl/Cmd+C 동작을 그대로 유지합니다.",
      };
    case "paste":
      return {
        badges: ["붙여넣기 요청", "입력 전 검사", "PTY 전달"],
        helper: "붙여넣기는 이후 위험도 검사나 Smart Paste 흐름을 거쳐 터미널 입력으로 전달됩니다.",
      };
    case "search":
      return {
        badges: ["검색 열기", "출력 탐색", "현재 세션 유지"],
        helper: "현재 터미널 세션을 그대로 둔 채 출력 검색 UI로 전환하는 흐름입니다.",
      };
    case "passthrough":
      return {
        badges: ["기본 키 처리", "xterm 위임", "터미널 동작 유지"],
        helper: "단축키로 가로채지 않는 입력은 xterm 기본 동작으로 넘겨 기존 터미널 동작을 보존합니다.",
      };
  }
}
