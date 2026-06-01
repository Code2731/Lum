import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: { path?: string }) => invokeMock(cmd, args),
}));

import FileExplorerPanel from "./FileExplorerPanel";

beforeEach(() => {
  invokeMock.mockReset();
});

describe("FileExplorerPanel", () => {
  const makeDirEntry = (name: string, path: string, is_dir = true, size = 0) => ({
    name,
    path,
    is_dir,
    size,
  });

  const renderPanel = (cwd: string, onCdTo = vi.fn(), onOpenFile = vi.fn(), onClose = vi.fn()) => {
    return render(
      <TooltipProvider>
        <FileExplorerPanel
          cwd={cwd}
          onClose={onClose}
          onCdTo={onCdTo}
          onOpenFile={onOpenFile}
        />
      </TooltipProvider>,
    );
  };

  it("초기 cwd 기준으로 경로를 조회한다", async () => {
    const entries = [makeDirEntry("readme.md", "/project/readme.md", false, 123)];
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.resolve(entries);
      }
      return Promise.resolve([]);
    });

    renderPanel("/project");

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/project" });
    });
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(
      invokeMock.mock.calls.filter(([cmd, args]) => cmd === "list_directory" && args?.path === "/project").length,
    ).toBe(1);
  });

  it("cwd가 바뀌면 새 경로로 다시 조회한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.resolve([makeDirEntry("project.txt", "/project/project.txt", false, 10)]);
      }
      if (cmd === "list_directory" && args?.path === "/workspace") {
        return Promise.resolve([makeDirEntry("workspace.txt", "/workspace/workspace.txt", false, 12)]);
      }
      return Promise.resolve([]);
    });

    const { rerender } = renderPanel("/project");

    await waitFor(() => expect(screen.getByText("project.txt")).toBeInTheDocument());

    rerender(
      <TooltipProvider>
        <FileExplorerPanel
          cwd="/workspace"
          onClose={vi.fn()}
          onCdTo={vi.fn()}
          onOpenFile={vi.fn()}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("workspace.txt")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/workspace" });
  });

  it("홈 버튼은 ~ 경로를 조회한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.resolve([]);
      }
      if (cmd === "list_directory" && args?.path === "~") {
        return Promise.resolve([makeDirEntry("home.txt", "/home/home.txt", false, 9)]);
      }
      return Promise.resolve([]);
    });

    renderPanel("/project");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/project" }));

    fireEvent.click(screen.getByLabelText("홈"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "~" }));
  });

  it("list_directory 실패 시 message 필드를 에러로 표시한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.reject({ message: "권한이 없습니다" });
      }
      return Promise.resolve([]);
    });

    renderPanel("/project");

    expect(await screen.findByText("권한이 없습니다")).toBeInTheDocument();
  });

  it("알 수 없는 실패 값이면 기본 메시지를 표시한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.reject({ message: "   " });
      }
      return Promise.resolve([]);
    });

    renderPanel("/project");

    expect(await screen.findByText("읽기 실패")).toBeInTheDocument();
  });
});
