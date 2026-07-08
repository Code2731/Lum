import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import RagPanel from "./RagPanel";

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
  it("인덱싱 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "index_project") return Promise.reject(new Error("인덱싱 중 오류"));
      if (cmd === "search_codebase") return Promise.resolve([]);
      if (cmd === "generate_embedding") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<RagPanel model="qwen" onClose={vi.fn()} />);

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
