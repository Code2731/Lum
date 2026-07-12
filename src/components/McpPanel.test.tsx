import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import McpPanel, {
  getMcpPanelEmptyMeta,
  getMcpPanelFlowMeta,
  getMcpServerDetailMeta,
} from "./McpPanel";

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
  it("상단/빈 상태/서버 상세 메타를 계산한다", () => {
    expect(getMcpPanelFlowMeta()).toEqual({
      badges: ["먼저 연결", "다음 도구 확인", "마지막 정리"],
      helper: "서버를 켜고 도구 목록을 확인한 뒤, 필요 없는 연결만 정리합니다.",
    });
    expect(getMcpPanelEmptyMeta()).toEqual({
      badges: ["추천 설치", "도구 시작", "바로 사용"],
      title: "등록된 MCP 서버가 없습니다.",
      actionLabel: "공식 프리셋 설치 (filesystem · playwright · git)",
    });
    expect(getMcpServerDetailMeta(true)).toEqual({
      badges: ["현재 서버", "활성 연결", "도구 확인"],
      helper: "실행 명령과 도구 목록을 먼저 보고, 필요한 서버만 유지합니다.",
    });
  });

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

    expect(screen.getByText("먼저 연결")).toBeInTheDocument();
    expect(screen.getByText("다음 도구 확인")).toBeInTheDocument();
    expect(screen.getByText("마지막 정리")).toBeInTheDocument();
    expect(screen.getByText("서버를 켜고 도구 목록을 확인한 뒤, 필요 없는 연결만 정리합니다.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "filesystem" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "filesystem" }));

    expect(await screen.findByText("현재 서버")).toBeInTheDocument();
    expect(screen.getByText("활성 연결")).toBeInTheDocument();
    expect(screen.getAllByText("도구 확인").length).toBeGreaterThan(0);
    expect(screen.getByText("실행 명령과 도구 목록을 먼저 보고, 필요한 서버만 유지합니다.")).toBeInTheDocument();
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
