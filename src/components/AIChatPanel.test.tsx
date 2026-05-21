import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AIChatPanel from "./AIChatPanel";

const createProps = () => ({
  messages: [],
  streaming: false,
  error: null as string | null,
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
  onExecute: vi.fn(),
});

describe("AIChatPanel", () => {
  it("입력창 Esc 키로 패널 닫기를 호출한다", () => {
    const props = createProps();
    render(<AIChatPanel {...props} />);

    const input = screen.getByPlaceholderText("질문하세요… (Enter 전송 · Shift+Enter 줄바꿈)");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("닫기 안내 문구는 Esc 기준으로 표시된다", () => {
    const props = createProps();
    render(<AIChatPanel {...props} />);

    expect(screen.getByText("Esc 로 닫기")).toBeInTheDocument();
  });
});
