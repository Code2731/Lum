import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TestResultCard from "./TestResultCard";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("TestResultCard", () => {
  it("실패 로그 복사 버튼이 클립보드에 실패 로그를 복사한다", async () => {
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

    invokeMock.mockResolvedValueOnce({
      command: "npm test",
      project_type: "node",
      detected_via: "package-json",
    });
    invokeMock.mockResolvedValueOnce({
      command: "npm test",
      stdout: "",
      stderr: "테스트 실패 로그",
      exit_code: 1,
      duration_ms: 1200,
      passed: false,
      timed_out: false,
    });

    render(<TestResultCard cwd="/tmp" />);

    fireEvent.click(await screen.findByRole("button", { name: "실행" }));
    expect(await screen.findByText("실패")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "실패 로그 복사" }));

    if (spyWriteText) {
      expect(spyWriteText).toHaveBeenCalledWith(
        expect.stringContaining("테스트가 실패했습니다. 커맨드: `npm test`"),
      );
    } else {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("테스트가 실패했습니다. 커맨드: `npm test`"),
      );
    }
  });

  it("성공 결과에서는 실패 로그 복사 버튼이 보이지 않는다", async () => {
    invokeMock.mockResolvedValueOnce({
      command: "npm test",
      project_type: "node",
      detected_via: "package-json",
    });
    invokeMock.mockResolvedValueOnce({
      command: "npm test",
      stdout: "all ok",
      stderr: "",
      exit_code: 0,
      duration_ms: 800,
      passed: true,
      timed_out: false,
    });

    render(<TestResultCard cwd="/tmp" />);

    fireEvent.click(await screen.findByRole("button", { name: "실행" }));
    expect(await screen.findByText("통과")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실패 로그 복사" })).not.toBeInTheDocument();
  });
});
