import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import RagPanel, {
  getRagPanelFlowMeta,
  getRagPanelIndexMeta,
  getRagPanelSearchMeta,
} from "./RagPanel";

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

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("RagPanel", () => {
  it("상단/인덱싱/검색 메타를 계산한다", () => {
    expect(getRagPanelFlowMeta()).toEqual({
      badges: ["먼저 인덱싱", "다음 질의", "마지막 결과 확인"],
      helper: "프로젝트를 먼저 읽어 두고, 질문을 던진 뒤 관련 코드 조각을 바로 확인합니다.",
    });
    expect(getRagPanelIndexMeta()).toEqual({
      badges: ["현재 경로", "인덱싱 실행", "오류 복사"],
      helper: "경로를 확인하고 인덱싱한 뒤, 실패하면 오류를 복사해 바로 점검합니다.",
    });
    expect(getRagPanelSearchMeta()).toEqual({
      badges: ["먼저 질문", "다음 로컬 검색", "스웜 확장"],
      helper: "질문을 입력하고 로컬에서 먼저 찾은 뒤, 필요하면 스웜으로 같은 질의를 넓힙니다.",
    });
  });

  it("인덱싱 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "index_project") return Promise.reject(new Error("인덱싱 중 오류"));
      if (cmd === "search_codebase") return Promise.resolve([]);
      if (cmd === "generate_embedding") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<RagPanel model="qwen" onClose={vi.fn()} />);

    expect(screen.getByText("먼저 인덱싱")).toBeInTheDocument();
    expect(screen.getByText("다음 질의")).toBeInTheDocument();
    expect(screen.getByText("마지막 결과 확인")).toBeInTheDocument();
    expect(screen.getByText("현재 경로")).toBeInTheDocument();
    expect(screen.getByText("인덱싱 실행")).toBeInTheDocument();
    expect(screen.getByText("오류 복사")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "인덱싱" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("index_project", { rootPath: "/project", model: "qwen" }));

    const copyButton = await screen.findByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      await waitFor(() => {
        expect(clipboardMock.restore).toHaveBeenCalledWith(expect.stringContaining("인덱싱 실패 — Error: 인덱싱 중 오류"));
      });
      clipboardMock.restore.mockRestore();
    } else {
      await waitFor(() => {
        expect(clipboardMock.writeText).toHaveBeenCalledWith(
          expect.stringContaining("인덱싱 실패 — Error: 인덱싱 중 오류"),
        );
      });
    }
  });
});
