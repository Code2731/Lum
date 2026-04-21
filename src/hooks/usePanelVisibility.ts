import { useState, useCallback } from "react";

export function usePanelVisibility() {
  const [showModelManager, setShowModelManager] = useState(false);
  const [showRagPanel, setShowRagPanel] = useState(false);
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [showCommitPanel, setShowCommitPanel] = useState(false);
  const [showXllmPanel, setShowXllmPanel] = useState(false);

  const closeOverlays = useCallback(() => {
    setShowHistorySearch(false);
    setShowCommitPanel(false);
    setShowXllmPanel(false);
  }, []);

  return {
    showModelManager, setShowModelManager,
    showRagPanel, setShowRagPanel,
    showHistorySearch, setShowHistorySearch,
    showCommitPanel, setShowCommitPanel,
    showXllmPanel, setShowXllmPanel,
    closeOverlays,
  };
}
