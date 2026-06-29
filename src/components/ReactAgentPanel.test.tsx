import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactAgentState } from "../hooks/useReactAgent";
import ReactAgentPanel from "./ReactAgentPanel";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

function makeState(overrides: Partial<ReactAgentState> = {}): ReactAgentState {
  return {
    status: "idle",
    mode: "plan",
    goal: "테스트 목표",
    cwd: "/workspace",
    planId: null,
    backend: null,
    model: null,
    plannedTools: [],
    steps: [],
    answer: "",
    changes: [],
    undoing: false,
    undoReport: null,
    ...overrides,
  };
}

function mockConfigAndScip() {
  const status = {
    enabled: true,
    backends: [
      {
        language: "rust",
        key: "rust",
        binary: "scip-rust",
        available: true,
        index_path: "/tmp/index.scip",
        index_exists: false,
      },
    ],
  };
  const invokeImpl = (cmd: string, _args?: unknown) => {
    if (cmd === "load_app_config") {
      return Promise.resolve({
        react_desktop_tools_enabled: false,
        react_scip_tools_enabled: false,
      });
    }
    if (cmd === "scip_status") {
      return Promise.resolve(status);
    }
    if (cmd === "scip_rebuild_index") {
      return Promise.resolve({
        requested_language: null,
        force: false,
        results: [
          {
            language: "rust",
            binary: "scip-rust",
            available: true,
            index_path: "/tmp/index.scip",
            requested: true,
            skipped: false,
            success: true,
            timed_out: false,
            message: "done",
          },
        ],
      });
    }
    return Promise.resolve({});
  };
  invokeMock.mockImplementation(invokeImpl as any);
}

describe("ReactAgentPanel", () => {
  const onCancel = vi.fn();
  const onClose = vi.fn();
  const onUndo = vi.fn();
  const onRunAct = vi.fn();

  beforeEach(() => {
    invokeMock.mockReset();
    onCancel.mockReset();
    onClose.mockReset();
    onUndo.mockReset();
    onRunAct.mockReset();
    mockConfigAndScip();
  });

  it("SCIP 재생성은 cwd가 비어 있으면 비활성화된다", async () => {
    render(
      <ReactAgentPanel
        state={makeState({ cwd: "" })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    const rebuildButton = await screen.findByTitle(
      "SCIP 백엔드의 index.scip를 생성/갱신합니다",
    );
    expect(rebuildButton).toBeDisabled();

    fireEvent.click(rebuildButton);
    expect(
      invokeMock.mock.calls.find((c) => c[0] === "scip_rebuild_index"),
    ).toBeUndefined();
  });

  it("SCIP 재생성 버튼 클릭 시 요청 파라미터와 결과 메시지를 반영한다", async () => {
    render(
      <ReactAgentPanel
        state={makeState({ cwd: "/workspace" })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    const rebuildButton = await screen.findByTitle(
      "SCIP 백엔드의 index.scip를 생성/갱신합니다",
    );
    expect(rebuildButton).toBeEnabled();

    fireEvent.click(rebuildButton);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "scip_rebuild_index",
        expect.objectContaining({
          cwd: "/workspace",
          language: null,
          force: false,
        }),
      );
      expect(screen.getByText("[성공] rust: done")).toBeInTheDocument();
    });
  });

  it("Plan 완료 상태에서 실행은 whitelist 없이 Act를 시작한다", async () => {
    mockConfigAndScip();
    const state = makeState({
      status: "done",
      mode: "plan",
      planId: "plan-1",
      plannedTools: ["read_file"],
      steps: [{ kind: "status", content: "plan" }],
    });

    render(
      <ReactAgentPanel
        state={state}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    const runButton = await screen.findByRole("button", { name: "실행" });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(onRunAct).toHaveBeenCalledWith(null);
    });
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_react_tool_whitelist",
      expect.anything(),
    );
  });

  it("변경 파일 위험도 배지는 한글 라벨과 정합된 툴팁을 보여준다", () => {
    render(
      <ReactAgentPanel
        state={makeState({
          status: "done",
          changes: [
            {
              path: "/workspace/src/main.rs",
              rel_path: "src/main.rs",
              kind: "modified",
              risk: "medium",
            },
            {
              path: "/workspace/Cargo.toml",
              rel_path: "Cargo.toml",
              kind: "modified",
              risk: "high",
            },
            {
              path: "/workspace/tests/agent.test.ts",
              rel_path: "tests/agent.test.ts",
              kind: "modified",
              risk: "low",
            },
          ],
        })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    expect(screen.getByTitle("일반 소스 변경 — 검토 권장")).toHaveTextContent(
      "보통",
    );
    expect(screen.getByTitle("빌드/설정 파일 변경 — 신중 검토 필요")).toHaveTextContent(
      "높음",
    );
    expect(screen.getByTitle("테스트 파일 변경 — 빠른 확인")).toHaveTextContent(
      "낮음",
    );
    expect(screen.getByText("변경 3")).toBeInTheDocument();
    expect(screen.getByText("· 높음 1")).toBeInTheDocument();
  });

  it("done/error/cancelled 상태에서만 변경 되돌리기 버튼이 보이고, 나머지 상태에서는 숨겨진다", () => {
    const { rerender } = render(
      <ReactAgentPanel
        state={makeState({
          status: "running",
          changes: [
            {
              path: "/workspace/src/a.ts",
              rel_path: "src/a.ts",
              kind: "modified",
              risk: "low",
            },
          ],
        })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "변경 되돌리기" }),
    ).not.toBeInTheDocument();

    rerender(
      <ReactAgentPanel
        state={makeState({
          status: "done",
          changes: [
            {
              path: "/workspace/src/a.ts",
              rel_path: "src/a.ts",
              kind: "modified",
              risk: "low",
            },
          ],
        })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    expect(screen.getByRole("button", { name: "변경 되돌리기" })).toBeEnabled();

    rerender(
      <ReactAgentPanel
        state={makeState({
          status: "error",
          changes: [
            {
              path: "/workspace/src/a.ts",
              rel_path: "src/a.ts",
              kind: "modified",
              risk: "low",
            },
          ],
        })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    expect(screen.getByRole("button", { name: "변경 되돌리기" })).toBeEnabled();

    rerender(
      <ReactAgentPanel
        state={makeState({
          status: "cancelled",
          changes: [
            {
              path: "/workspace/src/a.ts",
              rel_path: "src/a.ts",
              kind: "modified",
              risk: "low",
            },
          ],
        })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    expect(screen.getByRole("button", { name: "변경 되돌리기" })).toBeEnabled();
  });

  it("undo 실행 중에는 변경 되돌리기 버튼이 비활성화되고 되돌리는 중 문구를 노출한다", () => {
    render(
      <ReactAgentPanel
        state={makeState({
          status: "done",
          changes: [
            {
              path: "/workspace/src/a.ts",
              rel_path: "src/a.ts",
              kind: "modified",
              risk: "low",
            },
          ],
          undoing: true,
        })}
        onCancel={onCancel}
        onClose={onClose}
        onUndo={onUndo}
        onRunAct={onRunAct}
      />,
    );

    const undoButton = screen.getByRole("button", { name: "되돌리는 중..." });
    expect(undoButton).toBeDisabled();
  });
});
