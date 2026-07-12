// 쉘 프롬프트 접두사 제거 후 실행 가능한 줄만 반환
export function parseCommandLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trimEnd().replace(/^\s*[$%>]\s+/, ""))
    .filter((l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#");
    });
}

export function isMultiLineCommand(text: string): boolean {
  return parseCommandLines(text).length >= 2;
}

export interface SmartPasteFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getSmartPasteFlowSummary(text: string): SmartPasteFlowSummary {
  const commands = parseCommandLines(text);
  if (commands.length === 0) {
    return {
      primary: "붙여넣기 대기",
      secondary: "실행할 명령 없음",
      detail: "주석과 빈 줄만 있어 아직 실행할 명령을 찾지 못했습니다.",
    };
  }

  const first = commands[0];
  if (commands.length === 1) {
    return {
      primary: "단일 명령 감지",
      secondary: first,
      detail: "첫 명령 하나만 바로 실행 후보로 사용할 수 있습니다.",
    };
  }

  return {
    primary: `${commands.length}개 명령 감지`,
    secondary: first,
    detail: "여러 줄 명령으로 인식되어 순서대로 검토하거나 실행할 수 있습니다.",
  };
}
