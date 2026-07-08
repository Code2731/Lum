import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import McpPanel from "./McpPanel";

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

beforeEach(() => {
  invokeMock.mockReset();
});

describe("McpPanel", () => {
  it("툴 목록 조회 실패 시 에러 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_mcp_servers") {
        return Promise.resolve([
          {
            name: "filesystem",
            command: "npx",
            args: [],
            env: {},
            enabled: true,
            description: "파일 시스템 MCP",
          },
        ]);
      }
      if (cmd === "mcp_recommended_servers") {
        return Promise.resolve([]);
      }
      if (cmd === "mcp_list_tools") {
        return Promise.reject(new Error("툴 조회 실패"));
      }
      return Promise.resolve([]);
    });

    render(<McpPanel onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "filesystem" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "filesystem" }));

    expect(await screen.findByText("툴 조회 실패")).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    await waitFor(() => {
      if (clipboardMock.restore) {
        expect(clipboardMock.restore).toHaveBeenCalledWith("툴 조회 실패");
      } else {
        expect(clipboardMock.writeText).toHaveBeenCalledWith("툴 조회 실패");
      }
    });

    if (clipboardMock.restore) {
      clipboardMock.restore.mockRestore();
    }
  });
});

