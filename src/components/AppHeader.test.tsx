import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isPointerOutsideTargets } from "../utils/pointerGuard";
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    isMaximized: vi.fn(() => Promise.resolve(false)),
    onResized: vi.fn(() => Promise.resolve(vi.fn())),
    close: vi.fn(() => Promise.resolve()),
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
  })),
}));
import AppHeader, { type NewFeatureId } from "./AppHeader";

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
    showInspector: false,
    onToggleInspector: vi.fn(),
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

const ADVANCED_BUTTON_NAME = /^고급 기능 \(MCP \/ Squad \/ Healing \/ Recall \/ LoRA \/ RAG \/ xLLM\)(?: \(새 고급 기능이 있습니다\))?$/;

const installResizeObserverMock = () => {
  const originalResizeObserver = (globalThis as any).ResizeObserver;
  const observers: Array<() => void> = [];

  class TestResizeObserver {
    private onResize: () => void;
    constructor(cb: (entries: any[]) => void) {
      this.onResize = () => cb([]);
    }
    observe() {
      observers.push(this.onResize);
    }
    unobserve() {}
    disconnect() {}
  }

  (globalThis as any).ResizeObserver = TestResizeObserver as any;

  return {
    observers,
    restore: () => {
      (globalThis as any).ResizeObserver = originalResizeObserver;
    },
  };
};

describe("AppHeader", () => {
  it("팝오버 외부 클릭 판정은 ref가 null이어도 안전하게 동작한다", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    expect(isPointerOutsideTargets(target, [null, null])).toBe(true);
    expect(isPointerOutsideTargets(null, [null, null])).toBe(false);
  });

  it("팝오버 외부 클릭 판정은 트리거/패널 내부 클릭을 구분한다", () => {
    const trigger = document.createElement("button");
    const panel = document.createElement("div");
    const triggerChild = document.createElement("span");
    const panelChild = document.createElement("button");
    const outside = document.createElement("div");
    trigger.appendChild(triggerChild);
    panel.appendChild(panelChild);
    document.body.appendChild(trigger);
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    expect(isPointerOutsideTargets(triggerChild, [trigger, panel])).toBe(false);
    expect(isPointerOutsideTargets(panelChild, [trigger, panel])).toBe(false);
    expect(isPointerOutsideTargets(outside, [trigger, panel])).toBe(true);
  });

  it("fast 배지 title이 xLLM 표기로 노출된다", () => {
    const props = buildProps() as any;
    render(<AppHeader {...props} />);

    const fastBadge = screen.getByText("FAST · mock-model");
    expect(fastBadge).toHaveAttribute("title", "Fast (xLLM): mock-model");
  });

  it("모델 미로드 시 fast 배지 title이 xLLM 패널 안내를 노출한다", () => {
    const props = buildProps() as any;
    props.loadedModelId = null;
    render(<AppHeader {...props} />);

    const emptyBadge = screen.getByText("EMPTY · Empty Model");
    expect(emptyBadge).toHaveAttribute(
      "title",
      "xLLM에 로드된 모델이 없습니다 — xLLM 패널에서 모델을 [사용]하세요",
    );
  });

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

  it("고급 메뉴에서 Home/End 키로 상/하단으로 즉시 이동한다", async () => {
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

    fireEvent.keyDown(focusables[0], { key: "End" });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);

    fireEvent.keyDown(focusables[focusables.length - 1] as HTMLElement, { key: "Home" });
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

    const overflowButton = screen.getByRole("button", { name: ADVANCED_BUTTON_NAME });
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

  it("고급 메뉴는 화면 경계에서 잘림 없이 위치가 보정된다", async () => {
    const HeaderHarness = () => {
      const props = buildProps() as any;
      props.showAdvancedOverflow = true;
      return <AppHeader {...props} />;
    };

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const element = this;
        if (
          element instanceof HTMLButtonElement
          && (element.textContent?.includes("고급 기능") || element.textContent?.includes("기능 메뉴"))
        ) {
          return {
            x: 620,
            y: 260,
            width: 30,
            height: 28,
            top: 260,
            right: 650,
            bottom: 288,
            left: 620,
            toJSON: () => ({}),
          };
        }
        return originalGetBoundingClientRect.call(this);
      });

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 700,
    });

    try {
      render(<HeaderHarness />);
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });
      await waitFor(() => {
        expect(menu).toBeInTheDocument();
      });

      const top = Number.parseFloat(menu.style.top || "0");
      const left = Number.parseFloat(menu.style.left || "0");
      const width = Number.parseFloat(menu.style.width || "0");

      expect(top).toBeGreaterThanOrEqual(8);
      expect(top).toBeLessThanOrEqual(292);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left).toBeLessThanOrEqual(700 - 8);
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(700 - 16);
    } finally {
      spy.mockRestore();
    }
  });

  it("고급 메뉴는 작은 창 높이에서도 높이가 뷰포트 여백을 넘지 않는다", async () => {
    const props = buildProps() as any;
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      return (
        <AppHeader
          {...props}
          showAdvancedOverflow={showAdvancedOverflow}
          setShowAdvancedOverflow={setShowAdvancedOverflow}
        />
      );
    };

    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 180,
    });

    render(<HeaderHarness />);
    const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => domRect(130, 620, 30, 28),
    });

    fireEvent(window, new Event("resize"));

    const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });
    await waitFor(() => {
      const maxHeight = Number.parseFloat(menu.style.maxHeight || "0");
      expect(maxHeight).toBeLessThanOrEqual(164);
      expect(maxHeight).toBeGreaterThan(0);
    });

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("visualViewport 높이가 0이어도 고급 메뉴 높이는 innerHeight로 계산한다", async () => {
    const props = buildProps() as any;
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      return (
        <AppHeader
          {...props}
          showAdvancedOverflow={showAdvancedOverflow}
          setShowAdvancedOverflow={setShowAdvancedOverflow}
        />
      );
    };

    const originalInnerHeight = window.innerHeight;
    const originalVisualViewport = window.visualViewport;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        width: 0,
        height: 0,
        offsetLeft: 0,
        offsetTop: 0,
      },
    });

    render(<HeaderHarness />);
    const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => domRect(8, 620, 30, 28),
    });

    fireEvent(window, new Event("resize"));

    const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });
    await waitFor(() => {
      const maxHeight = Number.parseFloat(menu.style.maxHeight || "0");
      expect(maxHeight).toBeGreaterThan(300);
    });

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
  });

  it("툴바 버튼은 shortcut 속성을 aria-keyshortcuts로 노출한다", () => {
    render(<AppHeader {...buildProps()} />);

    expect(screen.getByRole("button", { name: "파일 탐색기" })).toHaveAttribute("aria-keyshortcuts", "Meta+B");
    expect(screen.getByRole("button", { name: "스크립트 라이브러리" })).toHaveAttribute("aria-keyshortcuts", "Meta+Shift+L");
    expect(screen.getByRole("button", { name: "워크스페이스" })).toHaveAttribute("aria-keyshortcuts", "Meta+Shift+S");
    expect(screen.getByRole("button", { name: "AI Diff 리뷰" })).toHaveAttribute("aria-keyshortcuts", "Meta+Shift+R");
    expect(screen.getByRole("button", { name: "시스템 모니터" })).toHaveAttribute("aria-keyshortcuts", "Meta+Shift+M");
    expect(screen.getByRole("button", { name: "터미널 테마" })).toHaveAttribute("aria-keyshortcuts", "Meta+,");
    expect(screen.getByRole("button", { name: "모델 관리" })).not.toHaveAttribute("aria-keyshortcuts");
  });

  it("고급 메뉴에서 새 기능 항목은 클릭 시 seen 플래그를 기록한다", () => {
    const onMarkAdvancedSeen = vi.fn();
    const cases = [
      { name: "Auto-Heal 학습 데이터셋", featureId: "healing" as NewFeatureId },
      { name: "메모리 검색", featureId: "recall" as NewFeatureId },
      { name: "LoRA Forge", featureId: "lora" as NewFeatureId },
      { name: "Skills — 절차 라이브러리", featureId: "skills" as NewFeatureId },
    ];

    for (const item of cases) {
      onMarkAdvancedSeen.mockClear();
      const result = render(
        <AppHeader
          {...buildProps() as any}
          showAdvancedOverflow={true}
          seenAdvancedFeatures={[]}
          onMarkAdvancedSeen={onMarkAdvancedSeen}
        />,
      );

      const menuItems = screen.getAllByRole("menuitem");
      const target = menuItems.find((el) => (el as HTMLElement).textContent?.includes(item.name));
      expect(target).toBeDefined();
      fireEvent.click(target as HTMLElement);
      expect(onMarkAdvancedSeen).toHaveBeenCalledTimes(1);
      expect(onMarkAdvancedSeen).toHaveBeenCalledWith(item.featureId);

      result.unmount();
    }
  });

  it("고급 인라인 모드에서 New 기능 버튼 클릭 시에도 seen 플래그를 기록한다", () => {
    const onMarkAdvancedSeen = vi.fn();
    const props = buildProps() as any;
    props.toolbarShowAdvanced = true;
    props.onMarkAdvancedSeen = onMarkAdvancedSeen;

    render(<AppHeader {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Auto-Heal 학습 데이터셋" }));
    fireEvent.click(screen.getByRole("button", { name: "메모리 검색 \(history\/healing\/memory\)" }));
    fireEvent.click(screen.getByRole("button", { name: "LoRA Forge — 내 데이터로 모델 학습" }));
    fireEvent.click(screen.getByRole("button", { name: "Skills — 절차 라이브러리" }));

    expect(onMarkAdvancedSeen).toHaveBeenCalledTimes(4);
    expect(onMarkAdvancedSeen).toHaveBeenCalledWith("healing");
    expect(onMarkAdvancedSeen).toHaveBeenCalledWith("recall");
    expect(onMarkAdvancedSeen).toHaveBeenCalledWith("lora");
    expect(onMarkAdvancedSeen).toHaveBeenCalledWith("skills");
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

    const overflowButton = screen.getByRole("button", { name: ADVANCED_BUTTON_NAME });
    overflowButton.focus();
    expect(overflowButton).toHaveFocus();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "고급 기능 메뉴" })).not.toBeInTheDocument();
    });
    expect(overflowButton).toHaveFocus();
  });

  it("고급 메뉴 내부 포인터 다운은 바깥 클릭으로 처리되지 않는다", async () => {
    const HeaderHarness = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
      const props = buildProps() as any;
      props.showAdvancedOverflow = showAdvancedOverflow;
      props.setShowAdvancedOverflow = setShowAdvancedOverflow;
      return <AppHeader {...props} />;
    };

    render(<HeaderHarness />);

    const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });
    fireEvent.pointerDown(menu);

    expect(screen.getByRole("menu", { name: "고급 기능 메뉴" })).toBeInTheDocument();
  });

  it("고급 메뉴를 열면 즉시 닫히지 않고 바깥에서 닫힌다", async () => {
    const props = buildProps() as any;
    const Wrapper = () => {
      const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(false);
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

    const advancedButton = screen.getByRole("button", { name: ADVANCED_BUTTON_NAME });
    fireEvent.click(advancedButton);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: "고급 기능 메뉴" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("menu", { name: "알림 센터" })).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "고급 기능 메뉴" })).not.toBeInTheDocument();
    });
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

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "알림 센터" })).not.toBeInTheDocument();
    });
    expect(notifButton).toHaveFocus();
  });

  it("알림 센터 내부 포인터 다운은 바깥 클릭으로 처리되지 않는다", async () => {
    const HeaderHarness = () => {
      const [showNotifCenter, setShowNotifCenter] = React.useState(true);
      const props = buildProps() as any;
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

    const menu = await screen.findByRole("menu", { name: "알림 센터" });
    fireEvent.pointerDown(menu);

    expect(screen.getByRole("menu", { name: "알림 센터" })).toBeInTheDocument();
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

    const advancedButton = screen.getByRole("button", { name: ADVANCED_BUTTON_NAME });
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

      const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
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
        expect(Number(menu.style.top.replace("px", ""))).toBeLessThan(730);
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
        expect(Number(notificationMenu.style.top.replace("px", ""))).toBeLessThan(730);
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("고급 메뉴는 패널 크기 변경 시 위치를 다시 계산한다", async () => {
    const originalInnerWidth = window.innerWidth;
    const mock = installResizeObserverMock();

    try {
      const props = buildProps() as any;
      const HeaderHarness = () => {
        const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
        return (
          <AppHeader
            {...props}
            showAdvancedOverflow={showAdvancedOverflow}
            setShowAdvancedOverflow={setShowAdvancedOverflow}
          />
        );
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });

      let panelWidth = 220;
      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(20, 620, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, panelWidth, 180),
      });
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 800,
      });

      fireEvent(window, new Event("resize"));
      await waitFor(() => {
        expect(Number(menu.style.left.replace("px", ""))).toBe(440);
        expect(Number(menu.style.width.replace("px", ""))).toBe(220);
      });

      panelWidth = 150;
      mock.observers[0]?.();

      await waitFor(() => {
        expect(Number(menu.style.left.replace("px", ""))).toBe(510);
        expect(Number(menu.style.width.replace("px", ""))).toBe(150);
      });
    } finally {
      mock.restore();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
  });

  it("알림 센터는 패널 크기 변경 시 위치를 다시 계산한다", async () => {
    const originalInnerWidth = window.innerWidth;
    const mock = installResizeObserverMock();

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

      let panelWidth = 320;
      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(20, 620, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, panelWidth, 180),
      });
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 800,
      });

      fireEvent(window, new Event("resize"));
      await waitFor(() => {
        expect(Number(menu.style.left.replace("px", ""))).toBe(340);
        expect(Number(menu.style.width.replace("px", ""))).toBe(320);
      });

      panelWidth = 170;
      mock.observers[0]?.();

      await waitFor(() => {
        expect(Number(menu.style.left.replace("px", ""))).toBe(490);
        expect(Number(menu.style.width.replace("px", ""))).toBe(170);
      });
    } finally {
      mock.restore();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
  });

  it("공간을 모두 확보할 수 있을 때 아래쪽 공간이 크면 아래로 배치한다", async () => {
    const originalInnerHeight = window.innerHeight;

    try {
      const props = buildProps() as any;

      const HeaderHarness = () => {
        const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
        return (
          <AppHeader
            {...props}
            showAdvancedOverflow={showAdvancedOverflow}
            setShowAdvancedOverflow={setShowAdvancedOverflow}
          />
        );
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });

      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(120, 0, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, 256, 180),
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 520,
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const menuEl = screen.getByRole("menu", { name: "고급 기능 메뉴" });
        expect(Number(menuEl.style.top.replace("px", ""))).toBeGreaterThan(120);
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("위아래 모두 들어가지 않을 때 아래쪽 여유가 더 크면 아래로 배치한다", async () => {
    const originalInnerHeight = window.innerHeight;

    try {
      const props = buildProps() as any;

      const HeaderHarness = () => {
        const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
        return (
          <AppHeader
            {...props}
            showAdvancedOverflow={showAdvancedOverflow}
            setShowAdvancedOverflow={setShowAdvancedOverflow}
          />
        );
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });

      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(20, 0, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, 256, 470),
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 500,
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const menuEl = screen.getByRole("menu", { name: "고급 기능 메뉴" });
        expect(Number(menuEl.style.top.replace("px", ""))).toBeGreaterThan(0);
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("고급 메뉴의 최대 높이가 화면 여백 기준으로 동적으로 제한된다", async () => {
    const originalInnerHeight = window.innerHeight;

    try {
      const props = buildProps() as any;
      const HeaderHarness = () => {
        const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
        return (
          <AppHeader
            {...props}
            showAdvancedOverflow={showAdvancedOverflow}
            setShowAdvancedOverflow={setShowAdvancedOverflow}
          />
        );
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });

      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(150, 0, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, 256, 440),
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 220,
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const menuEl = screen.getByRole("menu", { name: "고급 기능 메뉴" });
        expect(menuEl).toHaveStyle({ maxHeight: "138px" });
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("위아래 공간이 모두 작은 경우 뷰포트 기준 높이로 확장해 잘림을 완화한다", async () => {
    const originalInnerHeight = window.innerHeight;

    try {
      const props = buildProps() as any;
      const HeaderHarness = () => {
        const [showAdvancedOverflow, setShowAdvancedOverflow] = React.useState(true);
        return (
          <AppHeader
            {...props}
            showAdvancedOverflow={showAdvancedOverflow}
            setShowAdvancedOverflow={setShowAdvancedOverflow}
          />
        );
      };

      render(<HeaderHarness />);

      const button = await screen.findByRole("button", { name: ADVANCED_BUTTON_NAME });
      const menu = await screen.findByRole("menu", { name: "고급 기능 메뉴" });

      Object.defineProperty(button, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(60, 0, 40, 28),
      });
      Object.defineProperty(menu, "getBoundingClientRect", {
        configurable: true,
        value: () => domRect(0, 0, 256, 440),
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 140,
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const menuEl = screen.getByRole("menu", { name: "고급 기능 메뉴" });
        expect(menuEl).toHaveStyle({ maxHeight: "124px" });
        expect(menuEl).toHaveStyle({ top: "8px" });
      });
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });
});
