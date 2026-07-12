export type InspectorMenuHotkeyAction = "run" | "copy" | "load" | null;

export interface InspectorMenuHotkeyFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function resolveInspectorMenuHotkey(
  key: string,
  menuOpen: boolean,
): InspectorMenuHotkeyAction {
  const lower = key.toLowerCase();
  if (lower === "r") return "run";
  if (!menuOpen) return null;
  if (lower === "c") return "copy";
  if (lower === "l") return "load";
  return null;
}

export function getInspectorMenuHotkeyFlowSummary(
  action: Exclude<InspectorMenuHotkeyAction, null>,
): InspectorMenuHotkeyFlowSummary {
  switch (action) {
    case "run":
      return {
        badges: ["R 단축키", "즉시 실행", "현재 흐름 유지"],
        helper: "추천 커맨드를 바로 실행해 보고 결과를 현재 인스펙터 흐름에서 이어서 확인하는 동작입니다.",
      };
    case "copy":
      return {
        badges: ["C 단축키", "명령 복사", "외부 재사용"],
        helper: "추천 커맨드를 클립보드에 복사해 다른 입력창이나 외부 맥락으로 옮겨 쓰는 흐름입니다.",
      };
    case "load":
      return {
        badges: ["L 단축키", "AI 바 로드", "수정 후 실행"],
        helper: "추천 커맨드를 AI 입력바로 옮겨 약간 수정한 뒤 실행 흐름으로 넘기기 좋습니다.",
      };
  }
}
