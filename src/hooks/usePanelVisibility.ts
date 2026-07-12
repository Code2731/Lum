import { useState, useCallback } from "react";

export interface PanelVisibilitySnapshot {
  showModelManager: boolean;
  showRagPanel: boolean;
  showHistorySearch: boolean;
  showCommitPanel: boolean;
  showXllmPanel: boolean;
  showDiffReview: boolean;
  showThemePanel: boolean;
  showWorkspace: boolean;
  showScriptPanel: boolean;
  showSysmon: boolean;
  showNotifCenter: boolean;
  showMcpPanel: boolean;
  showPalette: boolean;
  showSshModal: boolean;
  showSquadPanel: boolean;
  showHealingDataset: boolean;
  showRecall: boolean;
  showHistoryGraph: boolean;
  showLoraForge: boolean;
  showSkills: boolean;
}

export interface PanelVisibilityMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getPanelVisibilityMeta(snapshot: PanelVisibilitySnapshot): PanelVisibilityMeta {
  const entries = Object.entries(snapshot) as Array<[keyof PanelVisibilitySnapshot, boolean]>;
  const openEntries = entries.filter(([, open]) => open);
  const overlayKeys: Array<keyof PanelVisibilitySnapshot> = [
    "showWorkspace",
    "showHistorySearch",
    "showDiffReview",
    "showPalette",
    "showSshModal",
    "showSquadPanel",
    "showHealingDataset",
    "showRecall",
    "showLoraForge",
    "showSkills",
  ];
  const openOverlayCount = overlayKeys.filter((key) => snapshot[key]).length;

  return {
    title: openEntries.length > 0 ? `열린 패널 ${openEntries.length}개` : "열린 패널이 없습니다",
    badges: [
      `전체 ${entries.length}개`,
      `열림 ${openEntries.length}개`,
      openOverlayCount > 0 ? `오버레이 ${openOverlayCount}개` : "오버레이 없음",
    ],
    helper: openEntries.length > 0
      ? "현재 열린 보조 패널과 오버레이 흐름을 기준으로 작업 문맥을 전환하거나 정리할 수 있습니다."
      : "필요한 보조 패널을 열면 모델, 검색, 워크스페이스, 자동화 흐름으로 바로 이동할 수 있습니다.",
  };
}

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
  const [showHistoryGraph, setShowHistoryGraph] = useState(false);
  const [showLoraForge, setShowLoraForge] = useState(false);
  const [showSkills, setShowSkills] = useState(false);

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
    setShowSkills(false);
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
    showHistoryGraph, setShowHistoryGraph,
    showLoraForge, setShowLoraForge,
    showSkills, setShowSkills,
    closeOverlays,
  };
}
