import { describe, expect, it } from "vitest";
import {
  getInspectorQuickActionBadgeClass,
  getInspectorQuickActionCardClass,
  getInspectorQuickActionDescriptionClass,
  getInspectorQuickActionFlowSummary,
} from "./inspectorQuickActionTone";

describe("inspectorQuickActionTone", () => {
  it("tone별 클래스 매핑을 반환한다", () => {
    expect(getInspectorQuickActionCardClass("danger")).toContain("rose");
    expect(getInspectorQuickActionBadgeClass("accent")).toContain("emerald");
    expect(getInspectorQuickActionDescriptionClass("default")).toContain("text-white/42");
  });

  it("danger tone은 복구 우선 흐름을 반환한다", () => {
    expect(getInspectorQuickActionFlowSummary("danger")).toEqual({
      badges: ["즉시 확인", "실패/위험 우선", "복구 흐름 진입"],
      helper: "문제가 분명한 상태라 먼저 열어 보고 복구 단서나 차단 요인을 확인하는 편이 좋습니다.",
    });
  });

  it("accent/cyan/amber/default tone 흐름을 반환한다", () => {
    expect(getInspectorQuickActionFlowSummary("accent")).toEqual({
      badges: ["주요 작업", "현재 문맥 유지", "바로 이어서 실행"],
      helper: "지금 작업 흐름과 직접 연결된 액션이라 전환 비용이 낮고 바로 이어서 쓰기 좋습니다.",
    });

    expect(getInspectorQuickActionFlowSummary("cyan")).toEqual({
      badges: ["분석 보조", "문맥 확장", "다음 단계 확인"],
      helper: "현재 상태를 조금 더 넓은 문맥에서 읽거나 다음 분석 단계로 넘어갈 때 적합합니다.",
    });

    expect(getInspectorQuickActionFlowSummary("amber")).toEqual({
      badges: ["검토 필요", "변화 확인", "주의 전환"],
      helper: "바뀐 상태나 확인이 필요한 지점이라 잠깐 멈추고 검토한 뒤 다음 액션을 고르는 흐름입니다.",
    });

    expect(getInspectorQuickActionFlowSummary("default")).toEqual({
      badges: ["기본 액션", "일반 탐색", "수동 선택"],
      helper: "특별히 강조되진 않지만 현재 화면에서 자주 쓰는 기본 액션으로 바로 접근할 수 있습니다.",
    });
  });
});
