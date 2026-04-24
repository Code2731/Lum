/**
 * MCP 툴 호출 응답 구조 파서.
 *
 * 표준 MCP tools/call 결과 형식:
 *   { content: [ { type: "text", text: "..." }, { type: "image", data: "base64...", mimeType: "image/png" }, ... ] }
 *
 * 파서는 관용적 — content가 없으면 전체를 단일 text 블록으로 간주.
 */

export type McpContent =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUri: string; mimeType: string }
  | { kind: "json"; value: unknown };

export interface ParsedMcpResult {
  blocks: McpContent[];
  /** 이미지가 하나 이상 포함되어 있는지 (UI에서 vision-only 안내용) */
  hasImage: boolean;
  /** AI에게 요약 전달 시 쓸 텍스트만 추출한 요약 */
  textSummary: string;
}

function isContentArray(v: unknown): v is Array<Record<string, unknown>> {
  return Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null);
}

export function parseMcpResult(raw: unknown): ParsedMcpResult {
  const blocks: McpContent[] = [];
  let hasImage = false;

  if (typeof raw === "string") {
    blocks.push({ kind: "text", text: raw });
  } else if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const content = obj.content;
    if (isContentArray(content)) {
      for (const item of content) {
        const type = item.type;
        if (type === "text" && typeof item.text === "string") {
          blocks.push({ kind: "text", text: item.text });
        } else if (
          type === "image" &&
          typeof item.data === "string" &&
          typeof item.mimeType === "string"
        ) {
          hasImage = true;
          blocks.push({
            kind: "image",
            dataUri: `data:${item.mimeType};base64,${item.data}`,
            mimeType: item.mimeType,
          });
        } else {
          blocks.push({ kind: "json", value: item });
        }
      }
    } else {
      blocks.push({ kind: "json", value: raw });
    }
  } else {
    blocks.push({ kind: "json", value: raw });
  }

  const textSummary = blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "image") return `(이미지: ${b.mimeType})`;
      return JSON.stringify(b.value);
    })
    .join("\n");

  return { blocks, hasImage, textSummary };
}
