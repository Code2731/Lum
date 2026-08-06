import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

const invokeMock = vi.fn();

type WriteSpy = ReturnType<typeof vi.fn>;
type RestoreSpy = ReturnType<typeof vi.spyOn>;

function setupClipboardWriteMock() {
  const writeText = vi.fn().mockResolvedValue(undefined) as WriteSpy;
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;

  if (originalClipboard) {
    return {
      writeText,
      restore: vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined) as RestoreSpy,
    };
  }

  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  return {
    writeText,
    restore: null as RestoreSpy | null,
  };
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: { path?: string }) => invokeMock(cmd, args),
}));

import FileExplorerPanel, { getFileExplorerFlowSummary } from "./FileExplorerPanel";

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
    expect(await screen.findByText("파일 탐색 준비")).toBeInTheDocument();
    expect(screen.getByText("마지막 열기·cd")).toBeInTheDocument();
    expect(screen.getByText("/project · 1개 항목")).toBeInTheDocument();
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

    expect((await screen.findAllByText("권한이 없습니다")).length).toBeGreaterThan(0);
  });

  it("알 수 없는 실패 값이면 기본 메시지를 표시한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.reject({ message: "   " });
      }
      return Promise.resolve([]);
    });

    renderPanel("/project");

    expect((await screen.findAllByText("읽기 실패")).length).toBeGreaterThan(0);
  });

  it("빈 폴더일 때 다음 탐색 흐름 안내를 보여준다", async () => {
    invokeMock.mockResolvedValue([]);

    renderPanel("/empty");

    expect((await screen.findAllByText("빈 폴더")).length).toBeGreaterThan(0);
    expect(screen.getByText("현재 위치")).toBeInTheDocument();
    expect(screen.getAllByText("/empty").length).toBeGreaterThan(0);
    expect(screen.getByText("파일 생성 준비")).toBeInTheDocument();
  });

  it("요약 함수는 로딩/오류/빈 폴더 상태를 반환한다", () => {
    expect(
      getFileExplorerFlowSummary({
        currentPath: "/repo",
        loading: true,
        error: null,
        entriesCount: 0,
      }),
    ).toEqual({
      primary: "폴더 읽는 중",
      secondary: "/repo",
      detail: "현재 경로의 파일과 폴더 목록을 불러오고 있습니다.",
    });
    expect(
      getFileExplorerFlowSummary({
        currentPath: "/repo",
        loading: false,
        error: "권한이 없습니다",
        entriesCount: 0,
      }),
    ).toEqual({
      primary: "탐색 오류 확인",
      secondary: "/repo",
      detail: "권한이 없습니다",
    });
    expect(
      getFileExplorerFlowSummary({
        currentPath: "/repo",
        loading: false,
        error: null,
        entriesCount: 0,
      }),
    ).toEqual({
      primary: "빈 폴더",
      secondary: "/repo",
      detail: "다른 경로로 이동하거나 상위 폴더로 돌아가 작업 위치를 다시 고를 수 있습니다.",
    });
  });

  it("목록 조회 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "list_directory" && args?.path === "/project") {
        return Promise.reject({ message: "권한이 없습니다" });
      }
      return Promise.resolve([]);
    });

    renderPanel("/project");

    expect((await screen.findAllByText("권한이 없습니다")).length).toBeGreaterThan(0);
    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("권한이 없습니다");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("권한이 없습니다");
    }
  });
});
