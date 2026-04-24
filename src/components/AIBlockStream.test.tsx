import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AIBlockStream from "./AIBlockStream";
import type { ChatMessage } from "../hooks/useAIChat";

const msg = (role: "user" | "assistant", content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: Date.now(),
});

describe("AIBlockStream", () => {
  it("메시지 없고 에러 없으면 렌더링 안 됨", () => {
    const { container } = render(
      <AIBlockStream messages={[]} streaming={false} error={null} onClear={vi.fn()} onExecute={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("에러만 있어도 렌더링", () => {
    render(
      <AIBlockStream
        messages={[]}
        streaming={false}
        error="Network error"
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("메시지 카운트 배지 표시", () => {
    render(
      <AIBlockStream
        messages={[msg("user", "안녕"), msg("assistant", "안녕하세요")]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByText(/2개 메시지/)).toBeInTheDocument();
  });

  it("사용자 메시지와 AI 답변 모두 렌더링", () => {
    render(
      <AIBlockStream
        messages={[msg("user", "파일 개수 세줘"), msg("assistant", "현재 디렉토리에 2개입니다.")]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByText("파일 개수 세줘")).toBeInTheDocument();
    expect(screen.getByText(/2개입니다/)).toBeInTheDocument();
  });

  it("X 버튼 클릭 → onClear 호출", () => {
    const onClear = vi.fn();
    render(
      <AIBlockStream
        messages={[msg("user", "안녕")]}
        streaming={false}
        error={null}
        onClear={onClear}
        onExecute={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle("대화 지우기"));
    expect(onClear).toHaveBeenCalled();
  });

  it("스트리밍 중엔 로더 아이콘 표시", () => {
    const { container } = render(
      <AIBlockStream
        messages={[msg("user", "hi")]}
        streaming={true}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    // lucide Loader2는 animate-spin 클래스로 식별
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});
