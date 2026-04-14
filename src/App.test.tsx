import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

// 1. Tauri API Mocking
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(async (cmd) => {
    if (cmd === "load_session") return [];
    if (cmd === "load_config") return { theme: "dark", font_size: 14, opacity: 1, accent_color: "#000" };
    if (cmd === "get_system_context") return { cwd: "/test/dir", git_branch: "main", files: [], project_summary: "" };
    if (cmd === "check_ollama_status") return true;
    if (cmd === "list_models") return ["llama3"];
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue({ then: vi.fn() }), // unlisten mock
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
  }),
}));

// 2. 외부 UI 라이브러리 Mocking
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent }: any) => (
    <div data-testid="virtuoso-mock">
      {data?.map((d: any, i: number) => (
        <div key={d.id || i}>{itemContent(i, d)}</div>
      ))}
    </div>
  ),
}));

vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: any) => <div data-testid="panel-group">{children}</div>,
  Panel: ({ children }: any) => <div data-testid="panel">{children}</div>,
  PanelResizeHandle: () => <div />,
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: any) => <div data-testid="markdown">{children}</div>,
}));

vi.mock("ansi-to-react", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("react-simple-code-editor", () => ({
  default: () => <textarea data-testid="mock-editor" />
}));

describe("App Integration (Terminal Workspace)", () => {
  it("앱의 메인 레이아웃과 기본 탭이 정상적으로 렌더링되어야 함", async () => {
    render(<App />);

    // 1. 타이틀바 렌더링 확인
    expect(screen.getByText("LUM")).toBeInTheDocument();
    
    // 2. 초기 탭 생성 여부 (Tauri invoke Mock에 의해 Restored가 아닌 Terminal 1 생성)
    await waitFor(() => {
      expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    });

    // 3. 모델 동기화 여부 확인 (online 클래스가 붙은 status-dot 렌더링 확인)
    await waitFor(() => {
      const statusDot = document.querySelector(".status-dot.online");
      expect(statusDot).toBeInTheDocument();
    });
  });
});
