import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import QuickActionsEditor, { getQuickActionsEditorFlowSummary } from "./QuickActionsEditor";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button type="button" className={className}>{children}</button>
  ),
  SelectValue: () => <span>선택</span>,
}));

vi.mock("@/components/ui/icon-button", () => ({
  IconButton: ({
    children,
    onClick,
    tooltip,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    tooltip?: string;
    className?: string;
  }) => (
    <button type="button" aria-label={tooltip} className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe("QuickActionsEditor", () => {
  function createProps() {
    return {
      actions: [
        {
          id: "action-1",
          label: "Dev",
          command: "npm run dev",
          shortcut: 1,
        },
      ],
      onAdd: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onMove: vi.fn(),
      onClose: vi.fn(),
    };
  }

  it("흐름 안내와 액션 요약을 렌더링한다", () => {
    render(<QuickActionsEditor {...createProps()} />);

    expect(screen.getByText("빠른 액션 편집")).toBeInTheDocument();
    expect(screen.getByText("빠른 액션 정리")).toBeInTheDocument();
    expect(screen.getByText("등록 1개 · 단축키 1개")).toBeInTheDocument();
    expect(screen.getByText("마지막 단축키 연결")).toBeInTheDocument();
    expect(screen.getByText("자주 쓰는 액션 순서를 먼저 다듬고, 이름·명령·단축키를 정리해 즉시 실행 흐름을 빠르게 만들 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("등록 1개 · 단축키 1개 사용 중")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dev")).toBeInTheDocument();
    expect(screen.getByDisplayValue("npm run dev")).toBeInTheDocument();
  });

  it("빈 목록에서는 첫 액션 추천 문구를 보여준다", () => {
    render(
      <QuickActionsEditor
        {...createProps()}
        actions={[]}
      />,
    );

    expect(screen.getByText("아직 등록된 액션이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("개발 서버, 테스트, 빌드처럼 반복 실행하는 명령부터 먼저 등록해 두면 작업 전환이 빨라집니다.")).toBeInTheDocument();
    expect(screen.getByText("첫 액션 준비")).toBeInTheDocument();
    expect(screen.getByText("등록 0개")).toBeInTheDocument();
    expect(screen.getByText("등록 0개 · 단축키 0개 사용 중")).toBeInTheDocument();
  });

  it("요약 함수는 빈 상태와 편집 상태를 반환한다", () => {
    expect(getQuickActionsEditorFlowSummary({ actionCount: 0, shortcutCount: 0 })).toEqual({
      primary: "첫 액션 준비",
      secondary: "등록 0개",
      detail: "개발 서버, 테스트, 빌드처럼 자주 쓰는 명령부터 먼저 등록해 작업 전환을 줄일 수 있습니다.",
    });
    expect(getQuickActionsEditorFlowSummary({ actionCount: 3, shortcutCount: 2 })).toEqual({
      primary: "빠른 액션 정리",
      secondary: "등록 3개 · 단축키 2개",
      detail: "자주 쓰는 액션 순서를 먼저 다듬고, 이름·명령·단축키를 정리해 즉시 실행 흐름을 빠르게 만들 수 있습니다.",
    });
  });

  it("새 액션 추가가 이름과 명령을 정리해서 onAdd로 전달한다", () => {
    const props = createProps();
    render(
      <QuickActionsEditor
        {...props}
        actions={[]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("이름"), { target: { value: " Test " } });
    fireEvent.change(screen.getByPlaceholderText("실행할 커맨드 (예: npm run dev)"), { target: { value: " npm test " } });
    fireEvent.click(screen.getByText("추가"));

    expect(props.onAdd).toHaveBeenCalledWith({
      label: "Test",
      command: "npm test",
      shortcut: undefined,
    });
  });

  it("기존 액션 입력 수정은 onUpdate를 호출한다", () => {
    const props = createProps();
    render(<QuickActionsEditor {...props} />);

    fireEvent.change(screen.getByDisplayValue("Dev"), { target: { value: "Build" } });
    fireEvent.change(screen.getByDisplayValue("npm run dev"), { target: { value: "npm run build" } });

    expect(props.onUpdate).toHaveBeenNthCalledWith(1, "action-1", { label: "Build" });
    expect(props.onUpdate).toHaveBeenNthCalledWith(2, "action-1", { command: "npm run build" });
  });
});
