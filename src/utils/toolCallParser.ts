/**
 * AI 응답에서 MCP 툴 호출 태그를 파싱.
 *
 * 형식: <tool_use server="X" name="Y" args='{"k":"v"}' />
 *
 * - `server`: MCP 서버 이름 (필수)
 * - `name`: 툴 이름 (필수)
 * - `args`: JSON 문자열 (선택, 기본 `{}`)
 *
 * 인용부호는 작은/큰따옴표 모두 허용. 한 메시지에서 여러 개 매칭.
 */

export interface ToolCall {
  server: string;
  name: string;
  args: unknown;
  /** 원본 태그 문자열 — UI에서 원문 보기용 */
  raw: string;
  /** 메시지 내 순서 (0-base) */
  index: number;
}

export interface ToolCallParseFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

// 속성: key="..." 또는 key='...'
const ATTR_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// tool_use 태그 전체 (self-closing 또는 </tool_use> 둘 다 허용)
const TAG_RE = /<tool_use\b([^>]*?)\/>|<tool_use\b([^>]*?)><\/tool_use>/gi;

function decodeHtmlEntities(value: string): string {
  let decoded = value;
  for (let i = 0; i < 3; i += 1) {
    const next = decoded
      .replace(/&quot;|&#34;/g, "\"")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrs)) !== null) {
    out[m[1].toLowerCase()] = decodeHtmlEntities(m[2] ?? m[3] ?? "");
  }
  return out;
}

export function parseToolCalls(raw: string): ToolCall[] {
  const calls: ToolCall[] = [];
  let m: RegExpExecArray | null;
  let idx = 0;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(raw)) !== null) {
    const attrsStr = m[1] ?? m[2] ?? "";
    const attrs = parseAttrs(attrsStr);
    const server = attrs.server;
    const name = attrs.name;
    if (!server || !name) continue;

    let args: unknown = {};
    const argsStr = attrs.args;
    if (argsStr) {
      try {
        args = JSON.parse(argsStr);
      } catch {
        // 파싱 실패 시 원본 문자열 유지 — 실행 시 백엔드가 거부
        args = { _raw: argsStr, _parse_error: true };
      }
    }

    calls.push({
      server,
      name,
      args,
      raw: m[0],
      index: idx++,
    });
  }
  return calls;
}

export function hasToolCalls(content: string): boolean {
  return /<tool_use\b[^>]*(\/>|><\/tool_use>)/i.test(content);
}

export function getToolCallParseFlowSummary(raw: string): ToolCallParseFlowSummary {
  const hasTag = hasToolCalls(raw);
  if (!hasTag) {
    return {
      primary: "툴 호출 없음",
      secondary: "일반 응답 유지",
      detail: "tool_use 태그가 없어 텍스트 응답만 표시합니다.",
    };
  }

  const calls = parseToolCalls(raw);
  if (calls.length === 0) {
    return {
      primary: "툴 호출 확인 필요",
      secondary: "필수 속성 누락",
      detail: "tool_use 태그는 있지만 server 또는 name 속성이 비어 있습니다.",
    };
  }

  const first = calls[0];
  return {
    primary: `${calls.length}개 툴 호출 감지`,
    secondary: `${first.server}/${first.name}`,
    detail:
      calls.length === 1
        ? "첫 번째 툴 호출을 바로 검토할 수 있습니다."
        : `첫 호출 포함 ${calls.length}개 순서대로 검토할 수 있습니다.`,
  };
}
