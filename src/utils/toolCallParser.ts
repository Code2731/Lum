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

// 속성: key="..." 또는 key='...'
const ATTR_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// tool_use 태그 전체 (self-closing 또는 </tool_use> 둘 다 허용)
const TAG_RE = /<tool_use\b([^>]*?)\/>|<tool_use\b([^>]*?)><\/tool_use>/g;

function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrs)) !== null) {
    out[m[1]] = m[2] ?? m[3] ?? "";
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
  return /<tool_use\b[^>]*(\/>|><\/tool_use>)/.test(content);
}
