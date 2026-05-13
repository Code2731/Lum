import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    isMaximized: vi.fn(() => Promise.resolve(false)),
    onResized: vi.fn(() => Promise.resolve(vi.fn())),
    close: vi.fn(() => Promise.resolve()),
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
  })),
}));
import AppHeader from "./AppHeader";

const buildProps = () => {
  return {
    specs: {
      total_memory_gb: 16,
      available_memory_gb: 8,
      cpu_cores: 8,
      gpu_type: "integrated" as const,
      wgpu_supported: false,
      gpu_name: "Apple GPU",
      recommended_engine: "xllm" as const,
      recommended_model: "mock",
      recommendation_reason: "",
    },
    specsLoading: false,
    viewMode: "terminal" as const,
    setViewMode: vi.fn(),
    loadedModelId: "mock-model",
    heavyModelId: "mock-heavy",
    heavyEnabled: false,
    privacyLedger: {
      state: {
        total: 0,
        onlineCalls: 0,
        perBackend: {
          embedded: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
          ollama: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
          xllm: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
          gemini: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
        },
        last: null,
      },
      reset: vi.fn(),
      isAllOnDevice: true,
    },
    squadStore: {
      squads: [],
      load: vi.fn(),
    },
    notifCenter: {
      notifications: [],
      unreadCount: 0,
      markAllRead: vi.fn(),
      dismiss: vi.fn(),
      clear: vi.fn(),
    },
    scriptLib: {
      loadScripts: vi.fn(),
      scripts: [],
      loading: false,
      saveScript: vi.fn(),
      deleteScript: vi.fn(),
      runScript: vi.fn(),
    },
    panels: {
      showModelManager: false,
      setShowModelManager: vi.fn(),
      showRagPanel: false,
      setShowRagPanel: vi.fn(),
      showHistorySearch: false,
      setShowHistorySearch: vi.fn(),
      showCommitPanel: false,
      setShowCommitPanel: vi.fn(),
      showXllmPanel: false,
      setShowXllmPanel: vi.fn(),
      showDiffReview: false,
      setShowDiffReview: vi.fn(),
      showThemePanel: false,
      setShowThemePanel: vi.fn(),
      showWorkspace: false,
      setShowWorkspace: vi.fn(),
      showScriptPanel: false,
      setShowScriptPanel: vi.fn(),
      showSysmon: false,
      setShowSysmon: vi.fn(),
      showNotifCenter: false,
      setShowNotifCenter: vi.fn(),
      showMcpPanel: false,
      setShowMcpPanel: vi.fn(),
      showPalette: false,
      setShowPalette: vi.fn(),
      showSshModal: false,
      setShowSshModal: vi.fn(),
      showSquadPanel: false,
      setShowSquadPanel: vi.fn(),
      showHealingDataset: false,
      setShowHealingDataset: vi.fn(),
      showHistoryGraph: false,
      setShowHistoryGraph: vi.fn(),
      showRecall: false,
      setShowRecall: vi.fn(),
      showLoraForge: false,
      setShowLoraForge: vi.fn(),
      showSkills: false,
      setShowSkills: vi.fn(),
      closeOverlays: vi.fn(),
    },
    showFileExplorer: false,
    setShowFileExplorer: vi.fn(),
    showReasoning: false,
    toggleReasoning: vi.fn(),
    toolbarShowAdvanced: false,
    toggleToolbarAdvanced: vi.fn(),
    showAdvancedOverflow: false,
    setShowAdvancedOverflow: vi.fn(),
    loadWorkspaces: vi.fn(),
    seenAdvancedFeatures: [] as string[],
    onMarkAdvancedSeen: vi.fn(),
  } as any;
};

const domRect = (top: number, left: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
});

describe("AppHeader", () => {
  it("고급 메뉴에서 화살표 키로 포커스가 순환 이동한다", async () => {
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      const [showNotifCenter, setShowNotifCenter] = React.useState(false);
      const props = buildProps() as any;
      props.showAdvancedOverflow = showAdvancedOverflow;
      props.setShowAdvancedOverflow = setShowAdvancedOverflow;
      props.showNotifCenter = showNotifCenter;
      props.setShowNotifCenter = setShowNotifCenter;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const mcpItem = await screen.findByRole("menuitem", { name: "MCP 서버" });
    mcpItem.focus();
    expect(mcpItem).toHaveFocus();

    const squadItem = screen.getByRole("menuitem", { name: "Worktree Squad" });
    const focusSpy = vi.spyOn(squadItem, "focus");

    fireEvent.keyDown(mcpItem, { key: "ArrowDown" });
    expect(focusSpy).toHaveBeenCalled();
    expect(squadItem).toHaveFocus();

    fireEvent.keyDown(squadItem, { key: "ArrowUp" });
    expect(mcpItem).toHaveFocus();
  });

  it("고급 메뉴에서 Tab 키로 포커스가 순환한다", async () => {
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      const props = buildProps() as any;
      props.showAdvancedOverflow = showAdvancedOverflow;
      props.setShowAdvancedOverflow = setShowAdvancedOverflow;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });
    const focusables = Array.from(menu.querySelectorAll("button")).filter((el) => !el.hasAttribute("disabled"));
    expect(focusables.length).toBeGreaterThan(2);

    focusables[0]?.focus();
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "Tab" });
    expect(document.activeElement).toBe(focusables[1]);

    focusables[1]?.focus();
    fireEvent.keyDown(focusables[1], { key: "Tab" });
    expect(document.activeElement).toBe(focusables[2]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusables[1]);

    focusables[focusables.length - 1]?.focus();
    fireEvent.keyDown(focusables[focusables.length - 1], { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("고급 메뉴에서 Escape로 닫으면 트리거로 포커스가 돌아간다", async () => {
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      const props = buildProps() as any;
      props.showAdvancedOverflow = showAdvancedOverflow;
      props.setShowAdvancedOverflow = setShowAdvancedOverflow;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const overflowButton = screen.getByRole("button", { name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)" });
    overflowButton.focus();
    expect(overflowButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "고급 기능 메뉴" })).not.toBeInTheDocument();
    });
    expect(overflowButton).toHaveFocus();
  });

  it("알림 센터에서 Escape로 닫으면 트리거로 포커스가 돌아간다", async () => {
    const HeaderHarness = () => {
      const [showNotifCenter, setShowNotifCenter] = React.useState(true);
      const props = buildProps() as any;
      props.showNotifCenter = showNotifCenter;
      props.setShowNotifCenter = setShowNotifCenter;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const notifButton = screen.getByRole("button", { name: "알림 센터" });
    notifButton.focus();
    expect(notifButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "알림 센터" })).not.toBeInTheDocument();
    });
    expect(notifButton).toHaveFocus();
  });

  it("고급 메뉴를 바깥에서 클릭하면 닫히고 트리거로 포커스가 돌아간다", async () => {
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      const props = buildProps() as any;
      props.showAdvancedOverflow = showAdvancedOverflow;
      props.setShowAdvancedOverflow = setShowAdvancedOverflow;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const overflowButton = screen.getByRole("button", { name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)" });
    overflowButton.focus();
    expect(overflowButton).toHaveFocus();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "고급 기능 메뉴" })).not.toBeInTheDocument();
    });
    expect(overflowButton).toHaveFocus();
  });

  it("알림 센터를 바깥에서 클릭하면 닫히고 트리거로 포커스가 돌아간다", async () => {
    const HeaderHarness = () => {
      const [showNotifCenter, setShowNotifCenter] = React.useState(true);
      const props = buildProps() as any;
      props.showNotifCenter = showNotifCenter;
      props.setShowNotifCenter = setShowNotifCenter;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const notifButton = screen.getByRole("button", { name: "알림 센터" });
    notifButton.focus();
    expect(notifButton).toHaveFocus();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "알림 센터" })).not.toBeInTheDocument();
    });
    expect(notifButton).toHaveFocus();
  });

  it("고급 기능 패널을 열 때 알림 센터를 닫는다", async () => {
    const props = buildProps() as any;
    const Wrapper = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(false);
      const [showNotifCenter, setShowNotifCenter] = React.useState(true);
      return (
        <AppHeader
          {...props}
          showAdvancedOverflow={showAdvancedOverflow}
          setShowAdvancedOverflow={setShowAdvancedOverflow}
          panels={{
            ...props.panels,
            showNotifCenter,
            setShowNotifCenter,
          }}
        />
      );
    };

    render(<Wrapper />);

    const advancedButton = screen.getByRole("button", { name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)" });
    const closeSpy = props.notifCenter.markAllRead;
    expect(screen.getByRole("menu", { name: "알림 센터" })).toBeInTheDocument();

    fireEvent.click(advancedButton);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "알림 센터" })).not.toBeInTheDocument();
      expect(screen.getByRole("menu", { name: "고급 기능 메뉴" })).toBeInTheDocument();
    });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("알림 센터를 열 때 고급 기능 패널을 닫는다", async () => {
    const props = buildProps() as any;
    const Wrapper = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      const [showNotifCenter, setShowNotifCenter] = React.useState(false);
      return (
        <AppHeader
          {...props}
          showAdvancedOverflow={showAdvancedOverflow}
          setShowAdvancedOverflow={setShowAdvancedOverflow}
          panels={{
            ...props.panels,
            showNotifCenter,
            setShowNotifCenter,
          }}
        />
      );
    };

    render(<Wrapper />);

    const notifButton = screen.getByRole("button", { name: "알림 센터" });
    expect(screen.getByRole("menu", { name: "고급 기능 메뉴" })).toBeInTheDocument();

    fireEvent.click(notifButton);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "고급 기능 메뉴" })).not.toBeInTheDocument();
      expect(screen.getByRole("menu", { name: "알림 센터" })).toBeInTheDocument();
    });
    expect(props.notifCenter.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("고급 메뉴는 패널 높이를 고려해 위쪽으로 배치한다", async () => {
    const originalInnerHeight = window.innerHeight;

    try {
      const HeaderHarness = () => {
        const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
        const props = buildProps() as any;
        props.showAdvancedOverflow = showAdvancedOverflow;
        props.setShowAdvancedOverflow = setShowAdvancedOverflow;
        return <AppHeader {...props} />;
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)" });
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });

      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(730, 0, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, 256, 420),
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 780,
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const menu = screen.getByRole("menu", { name: "고급 기능 메뉴" });
        expect(menu.className).toContain("bottom-full");
        expect(menu.className).not.toContain("top-full");
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("알림 센터는 패널 높이를 고려해 위쪽으로 배치된다", async () => {
    const originalInnerHeight = window.innerHeight;

    try {
      const props = buildProps() as any;

      const HeaderHarness = () => {
        const [showNotifCenter, setShowNotifCenter] = React.useState(true);
        return (
          <AppHeader
            {...props}
            panels={{
              ...props.panels,
              showNotifCenter,
              setShowNotifCenter,
            }}
          />
        );
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: "알림 센터" });
      const menu = await screen.findByRole("menu", { name: "알림 센터" });

      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(730, 0, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, 320, 420),
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 780,
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const notificationMenu = screen.getByRole("menu", { name: "알림 센터" });
        expect(notificationMenu.className).toContain("bottom-full");
        expect(notificationMenu.className).not.toContain("top-full");
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });
});
