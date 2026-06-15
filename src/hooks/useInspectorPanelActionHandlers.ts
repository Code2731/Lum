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
