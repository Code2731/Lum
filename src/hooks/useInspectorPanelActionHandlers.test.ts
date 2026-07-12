import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import {
  getInspectorPanelActionFlowSummary,
  getInspectorPanelActionsMeta,
  useInspectorPanelActionHandlers,
} from "./useInspectorPanelActionHandlers";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const invokeMock = vi.mocked(invoke);

describe("useInspectorPanelActionHandlers", () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it("액션별 흐름 요약을 반환한다", () => {
    expect(getInspectorPanelActionFlowSummary("density")).toEqual({
      badges: ["표시 밀도", "요약 형태 전환", "시야 조정"],
      helper: "인스펙터 정보 밀도를 현재 작업 집중도에 맞게 바꾸는 흐름입니다.",
    });
    expect(getInspectorPanelActionFlowSummary("workspace")).toEqual({
      badges: ["워크스페이스", "저장된 복귀 지점", "세션 재개"],
      helper: "저장된 탭 구성을 불러와 현재 작업 흐름을 빠르게 복구하는 액션입니다.",
    });
    expect(getInspectorPanelActionFlowSummary("failed_block")).toEqual({
      badges: ["실패 블록", "오류 원인 확인", "복구 진입"],
      helper: "실패한 실행 블록을 바로 열어 원인과 복구 단서를 먼저 확인하는 액션입니다.",
    });
    expect(getInspectorPanelActionsMeta({
      inspectorDensity: "compact",
      showWorkspace: true,
      showHistorySearch: false,
      showDiffReview: false,
    })).toEqual({
      title: "인스펙터 빠른 액션",
      badges: ["밀도 compact", "보조 패널 열림", "실패·히스토리·워크스페이스"],
      helper: "현재 인스펙터에서는 밀도 전환, 프로젝트 탐색, 워크스페이스 복귀, 히스토리 검색, diff 검토 흐름으로 빠르게 이동할 수 있습니다.",
    });
  });

  it("밀도 토글이 cozy/compact를 정확히 왕복한다", () => {
    const setup = renderHook(() => {
      const [showFileExplorer, setShowFileExplorer] = useState(false);
      const [inspectorDensity, setInspectorDensity] = useState<"cozy" | "compact">("cozy");
      const [showWorkspace, setShowWorkspace] = useState(false);
      const [showHistorySearch, setShowHistorySearch] = useState(false);
      const [showDiffReview, setShowDiffReview] = useState(false);
      const focusFailedBlock = vi.fn();

      const handlers = useInspectorPanelActionHandlers({
        setShowFileExplorer,
        setInspectorDensity,
        loadWorkspaces: vi.fn(),
        setShowWorkspace,
        setShowHistorySearch,
        setShowDiffReview,
        focusFailedBlock,
      });

      return {
        handlers,
        showWorkspace,
        showHistorySearch,
        showDiffReview,
        inspectorDensity,
        showFileExplorer,
      };
    });

    act(() => {
      setup.result.current.handlers.onDensityToggle();
      setup.result.current.handlers.onDensityToggle();
    });

    expect(setup.result.current.inspectorDensity).toBe("cozy");
  });

  it("프로젝트 폴더 토글 시 영속 상태를 저장한다", () => {
    const loadWorkspaces = vi.fn();

    const setup = renderHook(() => {
      const [showFileExplorer, setShowFileExplorer] = useState(true);
      const [, setInspectorDensity] = useState<"cozy" | "compact">("cozy");
      const [, setShowWorkspace] = useState(false);
      const [, setShowHistorySearch] = useState(false);
      const [, setShowDiffReview] = useState(false);
      const focusFailedBlock = vi.fn();

      const handlers = useInspectorPanelActionHandlers({
        setShowFileExplorer,
        setInspectorDensity,
        loadWorkspaces,
        setShowWorkspace,
        setShowHistorySearch,
        setShowDiffReview,
        focusFailedBlock,
      });

      return {
        handlers,
        showFileExplorer,
      };
    });

    act(() => {
      setup.result.current.handlers.onToggleProjectBin();
    });

    expect(invokeMock).toHaveBeenCalledWith("save_ui_preferences", { showFileExplorer: false });
  });

  it("워크스페이스/히스토리/다이프리뷰/실패블록 경로가 올바른 상태 변경을 수행한다", () => {
    const loadWorkspaces = vi.fn();
    const focusFailedBlock = vi.fn();

    const setup = renderHook(() => {
      const [, setShowFileExplorer] = useState(false);
      const [, setInspectorDensity] = useState<"cozy" | "compact">("cozy");
      const [showWorkspace, setShowWorkspace] = useState(false);
      const [showHistorySearch, setShowHistorySearch] = useState(false);
      const [showDiffReview, setShowDiffReview] = useState(false);

      const handlers = useInspectorPanelActionHandlers({
        setShowFileExplorer,
        setInspectorDensity,
        loadWorkspaces,
        setShowWorkspace,
        setShowHistorySearch,
        setShowDiffReview,
        focusFailedBlock,
      });

      return {
        handlers,
        showWorkspace,
        showHistorySearch,
        showDiffReview,
        focusFailedBlock,
      };
    });

    act(() => {
      setup.result.current.handlers.onOpenWorkspace();
      setup.result.current.handlers.onOpenHistory();
      setup.result.current.handlers.onOpenDiffReview();
      setup.result.current.handlers.onOpenFailedBlock();
    });

    expect(loadWorkspaces).toHaveBeenCalledTimes(1);
    expect(setup.result.current.showWorkspace).toBe(true);
    expect(setup.result.current.showHistorySearch).toBe(true);
    expect(setup.result.current.showDiffReview).toBe(true);
    expect(focusFailedBlock).toHaveBeenCalledTimes(1);
  });
});
