import { useState, useCallback } from "react";

export function usePanelVisibility() {
  const [showModelManager, setShowModelManager] = useState(false);
  const [showRagPanel, setShowRagPanel] = useState(false);
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [showCommitPanel, setShowCommitPanel] = useState(false);
  const [showXllmPanel, setShowXllmPanel] = useState(false);
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);

  const closeOverlays = useCallback(() => {
    setShowHistorySearch(false);
    setShowCommitPanel(false);
    setShowXllmPanel(false);
    setShowDiffReview(false);
    setShowThemePanel(false);
    setShowWorkspace(false);
  }, []);

  return {
    showModelManager, setShowModelManager,
    showRagPanel, setShowRagPanel,
    showHistorySearch, setShowHistorySearch,
    showCommitPanel, setShowCommitPanel,
    showXllmPanel, setShowXllmPanel,
    showDiffReview, setShowDiffReview,
    showThemePanel, setShowThemePanel,
    showWorkspace, setShowWorkspace,
    closeOverlays,
  };
}
