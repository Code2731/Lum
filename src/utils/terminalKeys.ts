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

export function classifyTerminalKey(
  e: { type: string; key: string; ctrlKey: boolean; metaKey: boolean },
  selection: string,
): KeyAction {
  if (e.type !== "keydown") return { kind: "passthrough" };
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return { kind: "passthrough" };

  if (e.key === "f") return { kind: "search" };
  if (e.key === "c") {
    return selection ? { kind: "copy", selection } : { kind: "passthrough" };
  }
  if (e.key === "v") return { kind: "paste" };

  return { kind: "passthrough" };
}
