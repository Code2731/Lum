export type InspectorQuickActionTone = "default" | "accent" | "cyan" | "amber" | "danger";

export interface InspectorQuickActionFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getInspectorQuickActionCardClass(tone: InspectorQuickActionTone) {
  switch (tone) {
    case "danger":
      return "inline-flex w-full min-h-[52px] items-start gap-2 rounded-md border border-rose-300/30 bg-rose-400/12 px-2.5 py-2 text-left text-rose-100 transition-colors hover:bg-rose-400/20";
    case "accent":
      return "inline-flex w-full min-h-[52px] items-start gap-2 rounded-md border border-emerald-300/26 bg-emerald-400/12 px-2.5 py-2 text-left text-emerald-50 transition-colors hover:bg-emerald-400/18";
    case "cyan":
      return "inline-flex w-full min-h-[52px] items-start gap-2 rounded-md border border-cyan-300/26 bg-cyan-400/12 px-2.5 py-2 text-left text-cyan-50 transition-colors hover:bg-cyan-400/18";
    case "amber":
      return "inline-flex w-full min-h-[52px] items-start gap-2 rounded-md border border-amber-300/26 bg-amber-400/12 px-2.5 py-2 text-left text-amber-50 transition-colors hover:bg-amber-400/18";
    default:
      return "inline-flex w-full min-h-[52px] items-start gap-2 rounded-md border border-white/12 bg-white/[0.05] px-2.5 py-2 text-left text-white/74 transition-colors hover:bg-white/[0.1] hover:text-white";
  }
}

export function getInspectorQuickActionBadgeClass(tone: InspectorQuickActionTone) {
  switch (tone) {
    case "danger":
      return "shrink-0 rounded-full border border-rose-200/25 bg-rose-300/12 px-1.5 py-0.5 text-[10px] font-medium text-rose-50/90";
    case "accent":
      return "shrink-0 rounded-full border border-emerald-200/25 bg-emerald-300/14 px-1.5 py-0.5 text-[10px] font-medium text-emerald-50/90";
    case "cyan":
      return "shrink-0 rounded-full border border-cyan-200/25 bg-cyan-300/14 px-1.5 py-0.5 text-[10px] font-medium text-cyan-50/90";
    case "amber":
      return "shrink-0 rounded-full border border-amber-200/25 bg-amber-300/14 px-1.5 py-0.5 text-[10px] font-medium text-amber-50/90";
    default:
      return "shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200/90";
  }
}

export function getInspectorQuickActionDescriptionClass(tone: InspectorQuickActionTone) {
  switch (tone) {
    case "danger":
      return "mt-1 block text-[11px] leading-4 text-rose-100/70";
    case "accent":
      return "mt-1 block text-[11px] leading-4 text-emerald-50/72";
    case "cyan":
      return "mt-1 block text-[11px] leading-4 text-cyan-50/72";
    case "amber":
      return "mt-1 block text-[11px] leading-4 text-amber-50/72";
    default:
      return "mt-1 block text-[11px] leading-4 text-white/42";
  }
}

export function getInspectorQuickActionFlowSummary(
  tone: InspectorQuickActionTone,
): InspectorQuickActionFlowSummary {
  switch (tone) {
    case "danger":
      return {
        badges: ["즉시 확인", "실패/위험 우선", "복구 흐름 진입"],
        helper: "문제가 분명한 상태라 먼저 열어 보고 복구 단서나 차단 요인을 확인하는 편이 좋습니다.",
      };
    case "accent":
      return {
        badges: ["주요 작업", "현재 문맥 유지", "바로 이어서 실행"],
        helper: "지금 작업 흐름과 직접 연결된 액션이라 전환 비용이 낮고 바로 이어서 쓰기 좋습니다.",
      };
    case "cyan":
      return {
        badges: ["분석 보조", "문맥 확장", "다음 단계 확인"],
        helper: "현재 상태를 조금 더 넓은 문맥에서 읽거나 다음 분석 단계로 넘어갈 때 적합합니다.",
      };
    case "amber":
      return {
        badges: ["검토 필요", "변화 확인", "주의 전환"],
        helper: "바뀐 상태나 확인이 필요한 지점이라 잠깐 멈추고 검토한 뒤 다음 액션을 고르는 흐름입니다.",
      };
    default:
      return {
        badges: ["기본 액션", "일반 탐색", "수동 선택"],
        helper: "특별히 강조되진 않지만 현재 화면에서 자주 쓰는 기본 액션으로 바로 접근할 수 있습니다.",
      };
  }
}
