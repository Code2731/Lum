import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

// 1. Tauri API Mocking
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(async (cmd) => {
    if (cmd === "load_session") return [];
    if (cmd === "load_config")
      return { theme: "dark", font_size: 14, opacity: 1, accent_color: "#000" };
    if (cmd === "get_system_context")
      return {
        cwd: "/test/dir",
        git_branch: "main",
        files: [],
        project_summary: "Test Project",
      };
    if (cmd === "check_ollama_status") return true;
    if (cmd === "list_models") return ["llama3"];
    if (cmd === "spawn_pty") return null;
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue({ then: vi.fn() }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
  }),
}));

// 2. UI Library Mocking
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
  Group: ({ children }: any) => <div data-testid="panel-group">{children}</div>,
  Panel: ({ children }: any) => <div data-testid="panel">{children}</div>,
  Separator: () => <div />,
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: any) => <div data-testid="markdown">{children}</div>,
}));

vi.mock("ansi-to-react", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("react-simple-code-editor", () => ({
  default: () => <textarea data-testid="mock-editor" />,
}));

describe("App Integration (Terminal Workspace)", () => {
  it("앱의 메인 레이아웃과 기본 탭이 정상적으로 렌더링되어야 함", async () => {
    render(<App />);
    expect(screen.getByText("LUM")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    });

    await waitFor(() => {
      const statusDot = document.querySelector(".status-dot.online");
      expect(statusDot).toBeInTheDocument();
    });
  });

  it("Cmd+K 단축키로 커맨드 팔레트를 열고 닫을 수 있어야 함", async () => {
    render(<App />);

    // 1. 처음에는 팔레트가 없음
    expect(
      screen.queryByPlaceholderText("명령어, 파일, 탭 검색..."),
    ).not.toBeInTheDocument();

    // 2. Cmd+K 시뮬레이션
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("명령어, 파일, 탭 검색..."),
      ).toBeInTheDocument();
    });

    // 3. ESC로 닫기
    fireEvent.keyDown(screen.getByPlaceholderText("명령어, 파일, 탭 검색..."), {
      key: "Escape",
    });

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("명령어, 파일, 탭 검색..."),
      ).not.toBeInTheDocument();
    });
  });

  it("Cmd+B 단축키로 시각적 브라우저(Webview)를 토글할 수 있어야 함", async () => {
    render(<App />);
    expect(screen.queryByTitle("Visual Context")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    await waitFor(() => {
      expect(screen.getByTitle("Visual Context")).toBeInTheDocument();
    });
  });

  it("에러가 포함된 터미널 블록 렌더링 시 Auto-Fix 버튼이 나타나야 함", async () => {
    // 1. 최신 워크스페이스 구조(Tab > Pane > Block)로 가짜 데이터 구성
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementationOnce(async (cmd) => {
      if (cmd === "load_session")
        return [
          {
            id: "test-tab",
            name: "Error Tab",
            panes: [
              {
                id: "test-pane",
                blocks: [
                  {
                    id: "error-block",
                    command: "git checkout invalid",
                    output: "error: pathspec 'invalid' did not match",
                    type: "shell",
                    status: "completed",
                    cwd: "/test",
                    gitBranch: "main",
                  },
                ],
              },
            ],
            activePaneId: "test-pane",
            orientation: "horizontal",
          },
        ];
      if (cmd === "load_config")
        return {
          theme: "dark",
          font_size: 14,
          opacity: 1,
          accent_color: "#000",
        };
      if (cmd === "get_system_context")
        return {
          cwd: "/test",
          git_branch: "main",
          files: [],
          project_summary: "",
        };
      if (cmd === "spawn_pty") return null;
      return null;
    });

    render(<App />);

    // 2. Auto-Fix 버튼이 렌더링되는지 확인
    await waitFor(() => {
      expect(screen.getByText(/Auto-Fix/i)).toBeInTheDocument();
    });
  });
});
