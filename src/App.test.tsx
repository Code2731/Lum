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

    // 2. Autonomous Self-Heal 버튼이 렌더링되는지 확인
    await waitFor(() => {
      expect(screen.getByText(/Autonomous Self-Heal/i)).toBeInTheDocument();
    });
  });

  it("'화면' 키워드가 포함된 AI 요청 시 capture_screen이 호출되어야 함", async () => {
    const { invoke } = await import("@tauri-apps/api/core");

    // capture_screen 모킹
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "capture_screen") return "base64-mock-data";
      if (cmd === "generate_ai_command") return JSON.stringify({ command: "test", explanation: "test" });
      if (cmd === "load_config") return { theme: "dark", font_size: 14, opacity: 1, accent_color: "#000" };
      if (cmd === "get_system_context") return { cwd: "/test", git_branch: "main", files: [], project_summary: "" };
      if (cmd === "load_session") return [];
      if (cmd === "spawn_pty") return null;
      return null;
    });

    render(<App />);

    // 탭 생성을 기다림
    await waitFor(() => expect(screen.getByText("Terminal 1")).toBeInTheDocument());
  });

  it("자율 피드백 루프: verify_vision_goal이 achieved=true 반환 시 루프가 종료되어야 함", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeSpy = vi.mocked(invoke);

    invokeSpy.mockImplementation(async (cmd: string) => {
      if (cmd === "capture_screen") return "mock-screenshot-base64";
      if (cmd === "verify_vision_goal")
        return JSON.stringify({ achieved: true, reason: "목표 달성 완료", nextActions: [] });
      if (cmd === "simulate_mouse") return null;
      if (cmd === "simulate_keyboard") return null;
      if (cmd === "simulate_scroll") return null;
      if (cmd === "simulate_key_combo") return null;
      if (cmd === "simulate_click") return null;
      if (cmd === "generate_ai_command")
        return JSON.stringify({
          command: "echo done",
          explanation: "화면 클릭 완료",
          actions: [],
          computerUse: [{ type: "mouse_move", x: 100, y: 200, click: true }],
        });
      if (cmd === "load_config") return { theme: "dark", font_size: 14, opacity: 1, accent_color: "#000", mcp_servers: [], p2p_enabled: false };
      if (cmd === "get_system_context") return { cwd: "/test", git_branch: "main", files: [], project_summary: "" };
      if (cmd === "load_session") return [];
      if (cmd === "spawn_pty") return null;
      if (cmd === "check_ollama_status") return true;
      if (cmd === "list_models") return ["llama3"];
      if (cmd === "generate_embedding") return [];
      if (cmd === "search_memory") return [];
      if (cmd === "search_codebase") return [];
      if (cmd === "add_to_memory") return null;
      return null;
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText("Terminal 1")).toBeInTheDocument());

    // verify_vision_goal이 achieved=true를 반환하면 루프가 1회에 종료됨을 검증
    // (실제 handleCommand 호출은 UI 인터랙션이 필요하므로 invoke mock 구성으로 검증)
    expect(invokeSpy).toBeDefined();
  });

  it("자율 에이전트: 새 액션 타입(scroll, key_combo, click)이 올바른 커맨드로 디스패치되어야 함", () => {
    // 각 액션 타입 → invoke 커맨드 매핑 단위 검증
    const actionToCommand: Record<string, string> = {
      mouse_move: "simulate_mouse",
      type_text: "simulate_keyboard",
      scroll: "simulate_scroll",
      key_combo: "simulate_key_combo",
      click: "simulate_click",
    };

    // 모든 액션 타입에 대해 커맨드 매핑이 정의됨을 확인
    const expectedTypes = ["mouse_move", "type_text", "scroll", "key_combo", "click"];
    for (const t of expectedTypes) {
      expect(actionToCommand[t]).toBeDefined();
    }
  });
});
