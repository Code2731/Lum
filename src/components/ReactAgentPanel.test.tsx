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

  it("Plan 완료 상태에서 실행은 whitelisted 도구를 전달한다", async () => {
    mockConfigAndScip();
    const state = makeState({
      status: "done",
      mode: "plan",
      planId: "plan-1",
      plannedTools: ["read_file", "write_file"],
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
    const autoApprove = screen.getByRole("checkbox", {
      name: "이 도구들 자동 승인",
    });
    fireEvent.click(autoApprove);
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_react_tool_whitelist", {
        whitelist: ["read_file", "write_file"],
      });
    });
    expect(onRunAct).toHaveBeenCalledWith(["read_file", "write_file"]);
  });
});
