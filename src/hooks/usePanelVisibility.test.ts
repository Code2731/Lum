import { describe, expect, it } from "vitest";
import { getPanelVisibilityMeta, type PanelVisibilitySnapshot } from "./usePanelVisibility";

function createClosedSnapshot(): PanelVisibilitySnapshot {
  return {
    showModelManager: false,
    showRagPanel: false,
    showHistorySearch: false,
    showCommitPanel: false,
    showXllmPanel: false,
    showDiffReview: false,
    showThemePanel: false,
    showWorkspace: false,
    showScriptPanel: false,
    showSysmon: false,
    showNotifCenter: false,
    showMcpPanel: false,
    showPalette: false,
    showSshModal: false,
    showSquadPanel: false,
    showHealingDataset: false,
    showRecall: false,
    showHistoryGraph: false,
    showLoraForge: false,
    showSkills: false,
  };
}

describe("usePanelVisibility helpers", () => {
  it("열린 패널이 없으면 대기 메타를 반환한다", () => {
    expect(getPanelVisibilityMeta(createClosedSnapshot())).toEqual({
      title: "열린 패널이 없습니다",
      badges: ["전체 20개", "열림 0개", "오버레이 없음"],
      helper: "필요한 보조 패널을 열면 모델, 검색, 워크스페이스, 자동화 흐름으로 바로 이동할 수 있습니다.",
    });
  });

  it("열린 패널 수와 오버레이 수를 함께 요약한다", () => {
    const snapshot = createClosedSnapshot();
    snapshot.showWorkspace = true;
    snapshot.showPalette = true;
    snapshot.showXllmPanel = true;
    snapshot.showSysmon = true;

    expect(getPanelVisibilityMeta(snapshot)).toEqual({
      title: "열린 패널 4개",
      badges: ["전체 20개", "열림 4개", "오버레이 2개"],
      helper: "현재 열린 보조 패널과 오버레이 흐름을 기준으로 작업 문맥을 전환하거나 정리할 수 있습니다.",
    });
  });
});
