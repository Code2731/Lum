import { useCallback, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InspectorDensity } from "../components/InspectorPanel/types";

interface UseInspectorPanelActionHandlersOptions {
  setShowFileExplorer: Dispatch<SetStateAction<boolean>>;
  setInspectorDensity: Dispatch<SetStateAction<InspectorDensity>>;
  loadWorkspaces: () => void;
  setShowWorkspace: Dispatch<SetStateAction<boolean>>;
  setShowHistorySearch: Dispatch<SetStateAction<boolean>>;
  setShowDiffReview: Dispatch<SetStateAction<boolean>>;
  focusFailedBlock: () => void;
}

export interface InspectorPanelActionHandlers {
  onDensityToggle: () => void;
  onToggleProjectBin: () => void;
  onOpenWorkspace: () => void;
  onOpenHistory: () => void;
  onOpenDiffReview: () => void;
  onOpenFailedBlock: () => void;
}

export type InspectorPanelActionKey =
  | "density"
  | "project_bin"
  | "workspace"
  | "history"
  | "diff"
  | "failed_block";

export interface InspectorPanelActionFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export interface InspectorPanelActionsMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getInspectorPanelActionsMeta(input: {
  inspectorDensity: InspectorDensity;
  showWorkspace: boolean;
  showHistorySearch: boolean;
  showDiffReview: boolean;
}): InspectorPanelActionsMeta {
  return {
    title: "인스펙터 빠른 액션",
    badges: [
      `밀도 ${input.inspectorDensity}`,
      input.showWorkspace || input.showHistorySearch || input.showDiffReview ? "보조 패널 열림" : "보조 패널 닫힘",
      "실패·히스토리·워크스페이스",
    ],
    helper: "현재 인스펙터에서는 밀도 전환, 프로젝트 탐색, 워크스페이스 복귀, 히스토리 검색, diff 검토 흐름으로 빠르게 이동할 수 있습니다.",
  };
}

export function getInspectorPanelActionFlowSummary(
  action: InspectorPanelActionKey,
): InspectorPanelActionFlowSummary {
  switch (action) {
    case "density":
      return {
        badges: ["표시 밀도", "요약 형태 전환", "시야 조정"],
        helper: "인스펙터 정보 밀도를 현재 작업 집중도에 맞게 바꾸는 흐름입니다.",
      };
    case "project_bin":
      return {
        badges: ["프로젝트 탐색기", "파일 문맥 확인", "탭과 함께 보기"],
        helper: "현재 탭과 같은 문맥에서 파일 구조를 확인하거나 바로 여는 흐름으로 이어집니다.",
      };
    case "workspace":
      return {
        badges: ["워크스페이스", "저장된 복귀 지점", "세션 재개"],
        helper: "저장된 탭 구성을 불러와 현재 작업 흐름을 빠르게 복구하는 액션입니다.",
      };
    case "history":
      return {
        badges: ["히스토리 검색", "과거 명령 확인", "재사용 흐름"],
        helper: "이전에 실행한 명령을 찾아 현재 작업에 다시 이어 붙일 때 적합한 흐름입니다.",
      };
    case "diff":
      return {
        badges: ["변경 검토", "차이 확인", "다음 수정 결정"],
        helper: "현재 변경 상태를 검토한 뒤 다음 수정이나 복구 액션을 정하는 흐름입니다.",
      };
    case "failed_block":
      return {
        badges: ["실패 블록", "오류 원인 확인", "복구 진입"],
        helper: "실패한 실행 블록을 바로 열어 원인과 복구 단서를 먼저 확인하는 액션입니다.",
      };
  }
}

export function useInspectorPanelActionHandlers({
  setShowFileExplorer,
  setInspectorDensity,
  loadWorkspaces,
  setShowWorkspace,
  setShowHistorySearch,
  setShowDiffReview,
  focusFailedBlock,
}: UseInspectorPanelActionHandlersOptions): InspectorPanelActionHandlers {
  const onDensityToggle = useCallback(() => {
    setInspectorDensity((prev) => (prev === "cozy" ? "compact" : "cozy"));
  }, [setInspectorDensity]);

  const onToggleProjectBin = useCallback(() => {
    setShowFileExplorer((prev) => {
      const next = !prev;
      invoke("save_ui_preferences", { showFileExplorer: next }).catch(() => {});
      return next;
    });
  }, [setShowFileExplorer]);

  const onOpenWorkspace = useCallback(() => {
    setShowWorkspace(true);
    void loadWorkspaces();
  }, [loadWorkspaces, setShowWorkspace]);

  const onOpenHistory = useCallback(() => {
    setShowHistorySearch(true);
  }, [setShowHistorySearch]);

  const onOpenDiffReview = useCallback(() => {
    setShowDiffReview(true);
  }, [setShowDiffReview]);

  const onOpenFailedBlock = useCallback(() => {
    focusFailedBlock();
  }, [focusFailedBlock]);

  return {
    onDensityToggle,
    onToggleProjectBin,
    onOpenWorkspace,
    onOpenHistory,
    onOpenDiffReview,
    onOpenFailedBlock,
  };
}
