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
