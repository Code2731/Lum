import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TestResultCard, { getTestResultFlowSummary } from "./TestResultCard";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("TestResultCard", () => {
  it("요약 함수는 감지 전/성공/실패 상태를 반환한다", () => {
    expect(getTestResultFlowSummary({ detected: null, result: null })).toEqual({
      primary: "테스트 감지 대기",
      secondary: "커맨드 없음",
      detail: "이 작업 폴더에서 실행할 테스트 커맨드를 아직 찾지 못했습니다.",
    });
    expect(
      getTestResultFlowSummary({
        detected: { command: "npm test", project_type: "node", detected_via: "package-json" },
        result: {
          command: "npm test",
          stdout: "ok",
          stderr: "",
          exit_code: 0,
          duration_ms: 800,
          passed: true,
          timed_out: false,
        },
      }),
    ).toEqual({
      primary: "테스트 통과",
      secondary: "0.8s",
      detail: "출력을 빠르게 검토한 뒤 다음 변경 작업으로 넘어갈 수 있습니다.",
    });
    expect(
      getTestResultFlowSummary({
        detected: { command: "npm test", project_type: "node", detected_via: "package-json" },
        result: {
          command: "npm test",
          stdout: "",
          stderr: "fail",
          exit_code: 1,
          duration_ms: 1200,
          passed: false,
          timed_out: false,
        },
      }),
    ).toEqual({
      primary: "테스트 실패",
      secondary: "exit 1",
      detail: "실패 원인을 읽고, 필요하면 로그 복사나 AI 수정 요청으로 바로 이어갈 수 있습니다.",
    });
  });

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

    expect(await screen.findByText("테스트 실행 준비")).toBeInTheDocument();
    expect(screen.getAllByText("npm test").length).toBeGreaterThan(0);
    expect(screen.getByText("마지막 수정 흐름 연결")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "실행" }));
    expect(await screen.findByText("실패")).toBeInTheDocument();
    expect(screen.getByText("실패 원인 확인")).toBeInTheDocument();
    expect(screen.getByText("로그 복사")).toBeInTheDocument();
    expect(screen.getByText("AI 수정 요청")).toBeInTheDocument();
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
    expect(screen.getByText("테스트 통과")).toBeInTheDocument();
    expect(screen.getAllByText("0.8s").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "실패 로그 복사" })).not.toBeInTheDocument();
  });

  it("테스트 실행기 오류는 객체형 메시지를 그대로 표시한다", async () => {
    invokeMock.mockResolvedValueOnce({
      command: "npm test",
      project_type: "node",
      detected_via: "package-json",
    });
    invokeMock.mockRejectedValueOnce({ message: "테스트 실행기를 시작할 수 없습니다" });

    render(<TestResultCard cwd="/tmp" />);

    fireEvent.click(await screen.findByRole("button", { name: "실행" }));

    expect(await screen.findByText("테스트 실행기를 시작할 수 없습니다")).toBeInTheDocument();
  });
});
