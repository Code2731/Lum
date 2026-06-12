import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useCommandBlocks } from "./hooks/useCommandBlocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "check_onboarding_complete") return Promise.resolve(true);
    if (cmd === "check_xllm_status") return Promise.resolve(false);
    if (cmd === "load_session") return Promise.reject("no session");
    if (cmd === "get_recent_history") return Promise.resolve([]);
    if (cmd === "search_history") return Promise.resolve([]);
    if (cmd === "get_hardware_specs") return Promise.resolve({
      total_memory_gb: 16,
      available_memory_gb: 8,
      cpu_cores: 8,
      gpu_type: "discrete",
      gpu_name: "RTX 3080",
      wgpu_supported: true,
      recommended_engine: "xllm",
      recommended_model: "Qwen2.5-Coder-7B",
      recommendation_reason: "충분한 VRAM",
    });
    return Promise.resolve("{}");
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./components/FileExplorerPanel", () => ({
  default: () => <div data-testid="file-explorer-mock" />,
}));

vi.mock("./components/TerminalPane", () => ({
  default: ({ id }: { id: string }) => (
    <div data-testid={`terminal-pane-${id}`}>terminal:{id}</div>
  ),
}));

vi.mock("./components/AiBar", () => ({
  default: ({ value, onChange, onSubmit, onCancel, onClose, disabled, processing }: any) => (
    <div data-testid="ai-bar-mock">
      <input
        data-testid="ai-bar-input"
        placeholder="AI에게 질문하세요… (Enter 전송 · Esc 닫기)"
        value={value}
        disabled={disabled}
        onChange={(e: any) => onChange(e.target.value)}
        onKeyDown={(e: any) => {
          if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      />
      {processing && <button data-testid="ai-bar-stop" aria-label="AI 응답 중지" onClick={onCancel}>Stop</button>}
      <span>Esc 또는 Cmd/Ctrl+Shift+K 로 닫기</span>
    </div>
  ),
}));

vi.mock("./components/TabBar", () => ({
  default: ({ onAddTab, onOpenSshModal, onToggleSplitH, onToggleSplitV, activeTab }: any) => (
    <div data-testid="tab-bar-mock">
      <button aria-label="새 탭 (Cmd/Ctrl+T)" onClick={onAddTab}>+</button>
      <button aria-label="SSH 연결 (Cmd/Ctrl+Shift+H)" onClick={onOpenSshModal}><svg /></button>
      <button
        aria-label="수평 분할 (Cmd/Ctrl+Shift+D)"
        aria-pressed={activeTab?.splitDir === "h" ? "true" : "false"}
        onClick={onToggleSplitH}
      >H</button>
      <button
        aria-label="수직 분할 (Cmd/Ctrl+Shift+E)"
        aria-pressed={activeTab?.splitDir === "v" ? "true" : "false"}
        onClick={onToggleSplitV}
      >V</button>
    </div>
  ),
}));

vi.mock("./hooks/useCommandBlocks", () => ({
  useCommandBlocks: vi.fn(),
}));

vi.mock("./components/InspectorPanel", () => ({
  __esModule: true,
  default: ({
    showInspector,
    onClose,
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    onOpenCompactMenu,
    commandMenuIndex,
  }: any) => {
    if (!showInspector) return null;
    return (
      <section>
        <button aria-label="Inspector 닫기" onClick={onClose}>Inspector 닫기</button>
        <div role="tablist" aria-label="Inspector 탭" />
        <button
          ref={(el) => {
            if (inspectorMoreButtonRefs?.current) {
              inspectorMoreButtonRefs.current[0] = el;
            }
            if (inspectorMenuFirstActionRefs?.current) {
              inspectorMenuFirstActionRefs.current[0] = el;
            }
          }}
          onClick={() => onOpenCompactMenu(0)}
        >
          MORE
        </button>
        {commandMenuIndex != null && <div role="menu">compact command menu</div>}
      </section>
    );
  },
}));

describe("App (Inspector compact command menu focus)", () => {
  const mockedInvoke = vi.mocked(invoke);
  const mockedUseCommandBlocks = vi.mocked(useCommandBlocks);

  const setMockCommandBlocks = (blocks: Array<{
    id: string;
    command: string;
    output: string;
    exitCode: number | null;
    startedAt: number;
    endedAt: number | null;
  }>) => {
    mockedUseCommandBlocks.mockReturnValue({
      blocks,
      feedRaw: vi.fn(),
      clearBlocks: vi.fn(),
    });
  };

  beforeEach(() => {
    mockedInvoke.mockClear();
    setMockCommandBlocks([]);
  });

  it("compact 분석 메뉴를 Escape로 닫으면 MORE 버튼으로 포커스가 복귀한다", async () => {
    vi.resetModules();

    const { default: App } = await import("./App");
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButton = screen.getByRole("button", { name: "MORE" });
    moreButton.focus();
    fireEvent.click(moreButton);

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(moreButton).toHaveFocus();
    });
  });
});
