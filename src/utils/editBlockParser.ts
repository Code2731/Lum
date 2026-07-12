/**
 * AI 응답 마크다운에서 SEARCH/REPLACE 블록을 파싱한다.
 * 백엔드 Rust 파서(edit_apply.rs)와 1:1 호환되는 TS 구현.
 *
 * 포맷:
 *   ```lang
 *   path/to/file.rs
 *   <<<<<<< SEARCH
 *   old
 *   =======
 *   new
 *   >>>>>>> REPLACE
 *   ```
 *
 * 파일 경로는 펜스 안 첫 줄 또는 펜스 직전 줄(백틱 인용 포함)에서 감지.
 */

export interface EditBlock {
  file: string;
  search: string;
  replace: string;
  index: number;
}

export interface EditBlockParseFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

function looksLikePath(s: string): boolean {
  if (!s || s.length >= 300) return false;
  if (/\s/.test(s)) return false;
  return s.includes("/") || s.includes(".") || s.includes("\\");
}

function extractFilePath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1. 백틱 인용 — 문장 속 `path/to/file`
  const m = trimmed.match(/`([^`\s]+)`/);
  if (m && looksLikePath(m[1])) return m[1];

  // 2. 줄 전체가 경로
  if (looksLikePath(trimmed)) return trimmed;

  return null;
}

export function parseEditBlocks(raw: string): EditBlock[] {
  const lines = raw.split("\n");
  const blocks: EditBlock[] = [];
  let pendingPath: string | null = null;
  let blockIndex = 0;

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // 펜스 아닌 줄에서 경로 감지
    if (trimmed && !trimmed.startsWith("```")) {
      const p = extractFilePath(trimmed);
      if (p) pendingPath = p;
    }

    // 펜스 시작
    if (trimmed.startsWith("```")) {
      const fenceStart = i;
      let innerPath: string | null = pendingPath;
      pendingPath = null;

      // 펜스 내 첫 줄이 경로면 사용
      if (i + 1 < lines.length) {
        const firstInner = lines[i + 1].trim();
        const p = extractFilePath(firstInner);
        if (p) innerPath = p;
      }

      // 블록 내부에서 SEARCH ... REPLACE 탐색
      let j = fenceStart + 1;
      while (j < lines.length) {
        if (lines[j].trim().startsWith("```")) break;
        if (lines[j].trim() === "<<<<<<< SEARCH") {
          const searchStart = j + 1;
          let sep = -1;
          let end = -1;
          let k = searchStart;
          while (k < lines.length) {
            if (lines[k].trim() === "=======") sep = k;
            else if (lines[k].trim() === ">>>>>>> REPLACE") {
              end = k;
              break;
            }
            k++;
          }
          if (sep !== -1 && end !== -1 && innerPath) {
            blocks.push({
              file: innerPath,
              search: lines.slice(searchStart, sep).join("\n"),
              replace: lines.slice(sep + 1, end).join("\n"),
              index: blockIndex++,
            });
            j = end + 1;
            continue;
          }
        }
        j++;
      }
      i = j + 1;
      continue;
    }

    i++;
  }

  return blocks;
}

/** 메시지 내용에 edit block이 있으면 분리, 없으면 원본 반환 */
export function hasEditBlocks(content: string): boolean {
  return content.includes("<<<<<<< SEARCH") && content.includes(">>>>>>> REPLACE");
}

export function getEditBlockParseFlowSummary(raw: string): EditBlockParseFlowSummary {
  const hasMarkers = hasEditBlocks(raw);
  if (!hasMarkers) {
    return {
      primary: "편집 블록 없음",
      secondary: "일반 응답 유지",
      detail: "SEARCH/REPLACE 블록이 없어 편집 제안 없이 텍스트만 표시합니다.",
    };
  }

  const blocks = parseEditBlocks(raw);
  if (blocks.length === 0) {
    return {
      primary: "편집 블록 확인 필요",
      secondary: "경로 또는 구문 누락",
      detail: "마커는 있지만 파일 경로 또는 완전한 SEARCH/REPLACE 구문이 없습니다.",
    };
  }

  const first = blocks[0];
  return {
    primary: `${blocks.length}개 편집 블록 감지`,
    secondary: first.file,
    detail:
      blocks.length === 1
        ? "첫 번째 변경안을 바로 검토할 수 있습니다."
        : `첫 파일 포함 ${blocks.length}개 변경안을 순서대로 검토할 수 있습니다.`,
  };
}
