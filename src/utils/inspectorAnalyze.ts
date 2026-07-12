function normalizeCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[$>#]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyShellCommand(candidate: string): boolean {
  if (!candidate) return false;
  if (candidate.length > 240) return false;
  const firstToken = candidate.split(/\s+/)[0] ?? "";
  if (!firstToken) return false;
  if (!/^[a-zA-Z0-9_./:@%+-]+$/.test(firstToken)) return false;
  return true;
}

function collectLineCandidate(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;

  const promptMatch = line.match(/^(?:[-*]\s*)?(?:\d+[.)]\s*)?\$\s+(.+)$/);
  if (promptMatch?.[1]) {
    const candidate = normalizeCandidate(promptMatch[1]);
    return isLikelyShellCommand(candidate) ? candidate : null;
  }

  const inlineCodeMatch = line.match(/^(?:[-*]\s*)?(?:\d+[.)]\s*)?`([^`\n]+)`/);
  if (inlineCodeMatch?.[1]) {
    const candidate = normalizeCandidate(inlineCodeMatch[1]);
    return isLikelyShellCommand(candidate) ? candidate : null;
  }

  return null;
}

export interface InspectorAnalyzeFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function extractInspectorAnalyzeCommands(content: string, limit = 3): string[] {
  if (!content.trim()) return [];
  const unique = new Set<string>();

  const lines = content.split(/\r?\n/);
  let inCodeFence = false;
  for (const line of lines) {
    const fenceMatch = line.trim().match(/^```(?:bash|sh|zsh|shell|cmd|powershell|pwsh)?\s*$/i);
    if (fenceMatch) {
      inCodeFence = !inCodeFence;
      continue;
    }

    const candidate = inCodeFence
      ? (() => {
          const normalized = normalizeCandidate(line);
          if (!normalized || normalized.startsWith("#")) return null;
          return isLikelyShellCommand(normalized) ? normalized : null;
        })()
      : collectLineCandidate(line);
    if (!candidate) continue;
    unique.add(candidate);
    if (unique.size >= limit) break;
  }

  return [...unique].slice(0, limit);
}

export function getInspectorAnalyzeFlowSummary({
  status,
  suggestedCount,
}: {
  status: "idle" | "streaming" | "done" | "error";
  suggestedCount: number;
}): InspectorAnalyzeFlowSummary {
  switch (status) {
    case "idle":
      return {
        badges: ["분석 대기", "실패 원인 미확인", "실행 후 시작"],
        helper: "아직 분석을 시작하지 않은 상태라 실패 블록을 기준으로 AI 분석을 먼저 실행하면 됩니다.",
      };
    case "streaming":
      return {
        badges: ["분석 중", "응답 수집", "추천 정리 대기"],
        helper: "AI 응답을 수집하는 동안이며 완료되면 요약과 추천 커맨드가 현재 카드에 정리됩니다.",
      };
    case "error":
      return {
        badges: ["분석 오류", "응답 확인 필요", "다시 시도 가능"],
        helper: "분석 응답이 오류로 끝나 현재 결과를 확인한 뒤 다시 요청하거나 프롬프트를 조정하는 흐름입니다.",
      };
    case "done":
      return {
        badges: ["분석 완료", `추천 ${suggestedCount}개`, suggestedCount > 0 ? "다음 액션 선택" : "수동 판단 필요"],
        helper:
          suggestedCount > 0
            ? "분석이 끝나 추천 커맨드까지 정리된 상태라 바로 실행, 복사, AI 바 로드 흐름으로 이어갈 수 있습니다."
            : "분석은 끝났지만 추천 커맨드가 없어 결과 요약을 바탕으로 다음 액션을 직접 정해야 합니다.",
      };
  }
}
