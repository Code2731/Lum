import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import EditBlockCard from "./EditBlockCard";
import type { EditBlock } from "../utils/editBlockParser";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

const block: EditBlock = {
  file: "src/main.ts",
  search: "console.log('old')",
  replace: "console.log('new')",
  index: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("EditBlockCard", () => {
  it("적용 실패 시 라우팅 에러면 xLLM 설정 버튼이 동작한다", async () => {
    const onOpenXllmPanel = vi.fn();
    invokeMock.mockRejectedValueOnce({ message: "임베디드 모델이 로드되지 않았습니다" });

    render(<EditBlockCard block={block} cwd="/tmp" onOpenXllmPanel={onOpenXllmPanel} />);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    fireEvent.click(await screen.findByLabelText("xLLM/모델 설정 열기"));
    expect(onOpenXllmPanel).toHaveBeenCalledTimes(1);
  });

  it("오류 텍스트를 클립보드에 복사할 수 있다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = (globalThis.navigator as Navigator & { clipboard?: { writeText: typeof writeText } }).clipboard;
    let spyWriteText: ReturnType<typeof vi.fn> | null = null;
    if (originalClipboard) {
      spyWriteText = vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined);
    } else {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
    }

    invokeMock.mockRejectedValueOnce({ message: "MCP 응답 타임아웃 (3000 ms)" });
    render(<EditBlockCard block={block} cwd="/tmp" />);

    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await screen.findByLabelText("오류 텍스트 복사");
    fireEvent.click(screen.getByLabelText("오류 텍스트 복사"));

    if (spyWriteText) {
      expect(spyWriteText).toHaveBeenCalledWith(expect.stringContaining("타임아웃"));
    } else {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("타임아웃"));
    }
  });

  it("실패 후 다시 적용 버튼이 다시 실행을 시도한다", async () => {
    invokeMock.mockRejectedValueOnce({ message: "임베디드 모델이 로드되지 않았습니다" });

    render(<EditBlockCard block={block} cwd="/tmp" />);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    fireEvent.click(await screen.findByRole("button", { name: "다시 적용" }));
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
