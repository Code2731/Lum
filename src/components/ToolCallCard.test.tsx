import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ToolCallCard from "./ToolCallCard";
import type { ToolCall } from "../utils/toolCallParser";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

const mockCall: ToolCall = {
  server: "filesystem",
  name: "read_text_file",
  args: { path: "/tmp/test.txt" },
  raw: "<tool_use server=\"filesystem\" name=\"read_text_file\" args='{ \"path\": \"/tmp/test.txt\" }' />",
  index: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("ToolCallCard", () => {
  it("성공 시 MCP 툴 호출 후 결과를 완료 상태로 표시한다", async () => {
    invokeMock.mockResolvedValue("result text");

    render(<ToolCallCard call={mockCall} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("mcp_call_tool", {
        serverName: "filesystem",
        toolName: "read_text_file",
        arguments: { path: "/tmp/test.txt" },
      }),
    );
    await waitFor(() => expect(screen.getByText("완료")).toBeInTheDocument());
    expect(screen.getByText("result text")).toBeInTheDocument();
  });

  it("라우팅 설정 오류를 AI 형식 안내문구로 표시한다", async () => {
    invokeMock.mockRejectedValue({
      message:
        "Ollama 백엔드가 미설정/미연결 상태입니다. 패널에서 모델/URL/API 키를 확인하고 다시 시도하세요.",
    });

    render(<ToolCallCard call={mockCall} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    expect(
      await screen.findByText((content) =>
        content.includes("해결: 백엔드 설정(모델/URL/API 키) 확인 후 다시 시도해 주세요."),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "재실행" })).toBeInTheDocument();
  });

  it("네트워크/연결 실패도 백엔드 복구 가이드를 붙여 표시한다", async () => {
    invokeMock.mockRejectedValue({ message: "MCP 응답 타임아웃 (3000 ms)" });

    render(<ToolCallCard call={mockCall} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    expect(await screen.findByText(/네트워크\/백엔드 연결 불안정/)).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("해결: 네트워크 상태와 백엔드 URL을 확인한 뒤 재시도하세요."),
      ),
    ).toBeInTheDocument();
  });

  it("취소 오류는 상태를 pending으로 되돌리고 에러를 표시하지 않는다", async () => {
    invokeMock.mockRejectedValue({ message: "canceled by user" });

    render(<ToolCallCard call={mockCall} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    expect(await screen.findByRole("button", { name: "실행" })).toBeInTheDocument();
    expect(screen.queryByText(/네트워크|라우팅 실패|알 수 없는 오류/)).not.toBeInTheDocument();
  });

  it("파싱 실패 args는 실행 없이 즉시 에러 상태로 표시한다", async () => {
    render(
      <ToolCallCard
        call={{
          ...mockCall,
          args: { _parse_error: true, _raw: "{bad-json" },
          raw: "<tool_use server=\"filesystem\" name=\"read_text_file\" args='{bad json' />",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    expect(
      await screen.findByText("args JSON 파싱 실패 — AI 응답의 인용부호 확인 필요"),
    ).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
