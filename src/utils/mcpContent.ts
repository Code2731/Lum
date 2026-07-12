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

export interface McpResultFlowSummary {
  badges: [string, string, string];
  helper: string;
}

function isContentArray(v: unknown): v is Array<Record<string, unknown>> {
  return Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeSummaryJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === "string") return serialized;
    return String(value);
  } catch {
    return "[직렬화 불가]";
  }
}

export function parseMcpResult(raw: unknown): ParsedMcpResult {
  const blocks: McpContent[] = [];
  let hasImage = false;

  if (typeof raw === "string") {
    blocks.push({ kind: "text", text: raw });
  } else if (isRecord(raw)) {
    const content = raw.content;
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
      return safeSummaryJson(b.value);
    })
    .join("\n");

  return { blocks, hasImage, textSummary };
}

export function getMcpResultFlowSummary(result: ParsedMcpResult): McpResultFlowSummary {
  const textCount = result.blocks.filter((block) => block.kind === "text").length;
  const jsonCount = result.blocks.filter((block) => block.kind === "json").length;

  if (result.blocks.length === 0) {
    return {
      badges: ["응답 없음", "블록 없음", "추가 호출 필요"],
      helper: "아직 표시할 MCP 응답 블록이 없어 도구 호출 결과를 다시 확인해야 합니다.",
    };
  }

  if (result.hasImage) {
    return {
      badges: [`블록 ${result.blocks.length}개`, "이미지 포함", textCount > 0 ? `텍스트 ${textCount}개` : "비전 중심 응답"],
      helper: "이미지 응답이 포함되어 있어 텍스트 요약과 함께 시각 정보까지 같이 확인하는 흐름입니다.",
    };
  }

  return {
    badges: [`블록 ${result.blocks.length}개`, textCount > 0 ? `텍스트 ${textCount}개` : "텍스트 없음", jsonCount > 0 ? `JSON ${jsonCount}개` : "구조화 응답 없음"],
    helper:
      jsonCount > 0
        ? "텍스트와 구조화 응답을 함께 읽으며 필요한 값을 추려 다음 액션으로 넘기는 흐름입니다."
        : "텍스트 중심 MCP 응답이라 바로 읽고 요약하거나 다음 프롬프트 문맥으로 넘기기 좋습니다.",
  };
}
