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
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [showSysmon, setShowSysmon] = useState(false);
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const [showMcpPanel, setShowMcpPanel] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSshModal, setShowSshModal] = useState(false);
  const [showSquadPanel, setShowSquadPanel] = useState(false);
  const [showHealingDataset, setShowHealingDataset] = useState(false);
  const [showRecall, setShowRecall] = useState(false);
  const [showLoraForge, setShowLoraForge] = useState(false);

  const closeOverlays = useCallback(() => {
    setShowHistorySearch(false);
    setShowCommitPanel(false);
    setShowXllmPanel(false);
    setShowDiffReview(false);
    setShowThemePanel(false);
    setShowWorkspace(false);
    setShowPalette(false);
    setShowSquadPanel(false);
    setShowHealingDataset(false);
    setShowRecall(false);
    setShowLoraForge(false);
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
    showScriptPanel, setShowScriptPanel,
    showSysmon, setShowSysmon,
    showNotifCenter, setShowNotifCenter,
    showMcpPanel, setShowMcpPanel,
    showPalette, setShowPalette,
    showSshModal, setShowSshModal,
    showSquadPanel, setShowSquadPanel,
    showHealingDataset, setShowHealingDataset,
    showRecall, setShowRecall,
    showLoraForge, setShowLoraForge,
    closeOverlays,
  };
}
