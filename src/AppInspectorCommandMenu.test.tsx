import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useCommandBlocks } from "./hooks/useCommandBlocks";
import App from "./App";

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
    onCompactMenuKeyDown,
    onOpenCompactMenu,
    onCloseCommandMenu,
    commandMenuIndex,
  }: any) => {
    if (!showInspector) return null;
    return (
      <section>
        <button aria-label="Inspector 닫기" onClick={onClose}>Inspector 닫기</button>
        <div role="tablist" aria-label="Inspector 탭" />
        {[0, 1].map((idx) => (
          <div key={idx} data-inspector-command-menu-row={idx + 1}>
            <button
              onClick={() => onCloseCommandMenu?.(false)}
            >
              {idx === 0 ? "RUN (R)" : `RUN (R) #${idx + 1}`}
            </button>
            <button
              ref={(el) => {
                if (inspectorMoreButtonRefs?.current) {
                  inspectorMoreButtonRefs.current[idx] = el;
                }
                if (inspectorMenuFirstActionRefs?.current) {
                  inspectorMenuFirstActionRefs.current[idx] = el;
                }
              }}
              onClick={() => onOpenCompactMenu(idx)}
            >
              MORE
            </button>
            {commandMenuIndex === idx && (
              <div
                role="menu"
                data-inspector-command-menu="compact"
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => onCompactMenuKeyDown?.(e, idx)}
              >
                <button
                  role="menuitem"
                  ref={(el) => {
                    if (inspectorMenuFirstActionRefs?.current) {
                      inspectorMenuFirstActionRefs.current[commandMenuIndex] = el;
                    }
                  }}
                >
                  {idx === 0 ? "COPY (C)" : "COPY (C) #2"}
                </button>
                <button role="menuitem">{idx === 0 ? "LOAD (L)" : "LOAD (L) #2"}</button>
              </div>
            )}
          </div>
        ))}
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
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButton = screen.getAllByRole("button", { name: "MORE" })[0];
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

  it("compact 메뉴 내부에서 포인터 다운은 메뉴를 닫지 않는다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButton = screen.getAllByRole("button", { name: "MORE" })[0];
    fireEvent.click(moreButton);

    await waitFor(() => screen.getByRole("menu"));
    const copyAction = screen.getAllByRole("button", { name: "COPY (C)" })[0];
    const commandRow = screen.getByText("RUN (R)");

    fireEvent.pointerDown(commandRow);
    fireEvent.pointerDown(copyAction);

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("compact 메뉴 밖의 포인터 다운은 메뉴를 닫고 포커스를 유지한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: "Inspector 닫기" });
    closeButton.focus();
    const moreButton = screen.getAllByRole("button", { name: "MORE" })[0];
    fireEvent.click(moreButton);

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(closeButton).toHaveFocus();
    });
  });

  it("compact 메뉴가 두 번째 행에서도 내부 포인터 다운은 메뉴를 닫지 않는다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[1]);

    const menu = await waitFor(() => screen.getByRole("menu"));
    const secondRunRow = screen.getByText("RUN (R) #2");
    const secondCopy = screen.getByText("COPY (C) #2");

    fireEvent.pointerDown(secondRunRow);
    fireEvent.pointerDown(secondCopy);

    expect(menu).toBeInTheDocument();
  });

  it("첫 번째 행 메뉴가 열려 있을 때 다른 행의 RUN 행 포인터다운은 메뉴를 닫지 않는다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[0]);

    const menu = await waitFor(() => screen.getByRole("menu"));
    const secondRunRow = screen.getByText("RUN (R) #2");

    fireEvent.pointerDown(secondRunRow);

    expect(menu).toBeInTheDocument();
  });

  it("메뉴가 열린 상태에서 다른 행의 MORE를 누르면 두 번째 행 메뉴가 열리며 포커스가 갱신된다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("COPY (C)")).toBeInTheDocument();
    });

    fireEvent.click(moreButtons[1]);

    const secondFirstAction = await waitFor(() => screen.getByText("COPY (C) #2"));
    expect(secondFirstAction).toHaveFocus();
    const menu = screen.getByRole("menu");
    const firstMenuButton = menu.querySelector("button");
    expect(firstMenuButton).toHaveTextContent("COPY (C) #2");
  });

  it("메뉴가 열린 상태에서 두 번째 행에서 첫 번째 행으로 전환하면 첫 번째 행 메뉴가 열리며 포커스가 갱신된다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[1]);

    await waitFor(() => {
      expect(screen.getByText("COPY (C) #2")).toBeInTheDocument();
    });

    fireEvent.click(moreButtons[0]);

    const firstFirstAction = await waitFor(() => screen.getByText("COPY (C)"));
    expect(firstFirstAction).toHaveFocus();
    const menu = screen.getByRole("menu");
    const firstMenuButton = menu.querySelector("button");
    expect(firstMenuButton).toHaveTextContent("COPY (C)");
  });

  it("다른 행의 RUN 클릭은 메뉴를 닫는다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[1]);

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    const secondRunRow = screen.getByText("RUN (R) #2");
    fireEvent.click(secondRunRow);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("첫 번째 행 메뉴 열린 상태에서 다른 행 RUN 클릭은 메뉴를 닫고 대상 RUN에 포커스를 둔다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    const secondRunRow = screen.getByText("RUN (R) #2");
    secondRunRow.focus();
    fireEvent.click(secondRunRow);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(secondRunRow).toHaveFocus();
    });
  });

  it("두 번째 행 메뉴가 열려 있을 때 바깥 포인터다운은 원래 MORE 버튼으로 포커스를 복구한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: "Inspector 닫기" });
    const moreButtons = screen.getAllByRole("button", { name: "MORE" });

    closeButton.focus();
    fireEvent.click(moreButtons[1]);

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(moreButtons[1]).toHaveFocus();
    });
  });

  it("첫 번째 행 RUN 클릭은 메뉴를 닫고 클릭한 RUN 요소 포커스를 유지한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[0]);

    const firstRunRow = screen.getByText("RUN (R)");
    firstRunRow.focus();
    fireEvent.click(firstRunRow);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(firstRunRow).toHaveFocus();
    });
  });

  it("두 번째 행의 compact 메뉴가 열리면 해당 행의 첫 액션으로 포커스가 이동한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[1]);

    const firstAction = await waitFor(() => screen.getByText("COPY (C) #2"));
    expect(firstAction).toHaveFocus();
  });

  it("두 번째 행의 compact 메뉴에서 Escape를 누르면 두 번째 MORE 버튼으로 포커스가 복귀한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    moreButtons[1].focus();
    fireEvent.click(moreButtons[1]);

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(moreButtons[1]).toHaveFocus();
    });
  });

  it("두 번째 행 compact 메뉴에서 ArrowRight로 액션 포커스를 다음 항목으로 이동한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[1]);

    const copyAction = await waitFor(() => screen.getByText("COPY (C) #2"));
    const loadAction = screen.getByText("LOAD (L) #2");
    const menu = screen.getByRole("menu");

    await waitFor(() => {
      expect(copyAction).toHaveFocus();
    });

    fireEvent.keyDown(menu, { key: "ArrowRight" });

    await waitFor(() => {
      expect(loadAction).toHaveFocus();
    });
  });

  it("두 번째 행 RUN 클릭은 메뉴를 닫고 클릭한 RUN 요소 포커스를 유지한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole("button", { name: "MORE" });
    fireEvent.click(moreButtons[1]);

    const secondRunRow = screen.getByText("RUN (R) #2");
    const menu = await waitFor(() => screen.getByRole("menu"));
    secondRunRow.focus();
    fireEvent.click(secondRunRow);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(secondRunRow).toHaveFocus();
    });
  });
});
