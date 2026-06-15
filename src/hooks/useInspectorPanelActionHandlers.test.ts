import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useInspectorPanelActionHandlers } from "./useInspectorPanelActionHandlers";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const invokeMock = vi.mocked(invoke);

describe("useInspectorPanelActionHandlers", () => {
  beforeEach(() => {
    invokeMock.mockClear();
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
      const [inspectorDensity, setInspectorDensity] = useState<"cozy" | "compact">("cozy");
      const [showWorkspace, setShowWorkspace] = useState(false);
      const [showHistorySearch, setShowHistorySearch] = useState(false);
      const [showDiffReview, setShowDiffReview] = useState(false);
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
      const [showFileExplorer, setShowFileExplorer] = useState(false);
      const [inspectorDensity, setInspectorDensity] = useState<"cozy" | "compact">("cozy");
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
