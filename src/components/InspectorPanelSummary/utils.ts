export function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function getInspectorIdlePrimaryFlow(): {
  badges: [string, string, string];
  helper: string;
} {
  return {
    badges: ["먼저 실행", "다음 실패 확인", "마지막 기록 확인"],
    helper: "명령을 한 번 실행하면 실패 블록, 추천 커맨드, 최근 기록 흐름이 차례로 열립니다.",
  };
}

export function getInspectorIdleContextFlow(activeTabTitle: string): {
  badges: [string, string, string];
  helper: string;
} {
  return {
    badges: ["현재 탭", activeTabTitle || "터미널", "실행 대기"],
    helper: "이 탭에서 첫 명령을 실행하면 이후 실패 분석과 최근 기록이 같은 문맥으로 쌓입니다.",
  };
}

export function getInspectorActiveFlow(options: {
  failedBlockCount: number;
  hasAnalyzeCache: boolean;
  hasRecentBlocks: boolean;
}): {
  badges: [string, string, string];
  helper: string;
  tone: "cyan" | "amber";
} {
  const { failedBlockCount, hasAnalyzeCache, hasRecentBlocks } = options;

  if (failedBlockCount > 0) {
    return {
      badges: [
        `실패 ${failedBlockCount}건`,
        hasAnalyzeCache ? "분석 결과 확인" : "AI 분석 시작",
        hasRecentBlocks ? "최근 기록 비교" : "기록 대기",
      ],
      helper: hasAnalyzeCache
        ? "실패 블록이 감지되었습니다. 먼저 분석 결과를 확인하고, 이어서 최근 기록과 비교하며 복구 흐름을 좁히면 됩니다."
        : "실패 블록이 감지되었습니다. 먼저 실패 분석을 열고, 그다음 최근 기록과 함께 복구 단서를 확인하는 흐름이 가장 빠릅니다.",
      tone: "amber",
    };
  }

  return {
    badges: [
      hasAnalyzeCache ? "분석 결과 유지" : "정상 흐름 유지",
      hasRecentBlocks ? "최근 기록 확인" : "기록 대기",
      "빠른 작업 준비",
    ],
    helper: hasAnalyzeCache
      ? "현재 실패는 없지만 분석 결과와 최근 기록이 남아 있어 다음 작업 전후 맥락을 바로 이어볼 수 있습니다."
      : "현재 실패는 없습니다. 최근 기록과 빠른 작업 메뉴를 기준으로 다음 실행을 이어가면 됩니다.",
    tone: "cyan",
  };
}

export function getInspectorActivePrimaryAction(options: {
  failedBlockCount: number;
  hasFocusedFailedBlock: boolean;
  hasAnalyzeCache: boolean;
  hasRecentBlocks: boolean;
}): {
  label: string;
  helper: string;
  action: "analyze-failure" | "focus-failure" | "open-recent" | "open-quick-actions";
} {
  const { failedBlockCount, hasFocusedFailedBlock, hasAnalyzeCache, hasRecentBlocks } = options;

  if (failedBlockCount > 0 && hasFocusedFailedBlock && !hasAnalyzeCache) {
    return {
      label: "실패 분석 시작",
      helper: "가장 최근 실패 블록을 바로 분석해 복구 단서를 먼저 확보합니다.",
      action: "analyze-failure",
    };
  }

  if (failedBlockCount > 0 && hasFocusedFailedBlock) {
    return {
      label: "실패 블록 다시 보기",
      helper: "분석 결과와 함께 현재 실패 블록으로 돌아가 로그와 제안 커맨드를 맞춰 봅니다.",
      action: "focus-failure",
    };
  }

  if (hasRecentBlocks) {
    return {
      label: "최근 기록 열기",
      helper: "가장 최근 실행 기록을 열어 다음 작업을 현재 문맥에서 이어갑니다.",
      action: "open-recent",
    };
  }

  return {
    label: "빠른 작업 열기",
    helper: "복구나 탐색이 필요 없다면 빠른 작업 메뉴에서 다음 작업으로 바로 이동합니다.",
    action: "open-quick-actions",
  };
}
