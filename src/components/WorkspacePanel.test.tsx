import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusMainInput } from "@/utils/focus";
import WorkspacePanel from "./WorkspacePanel";

const closeAutoFocusEvent = {
  preventDefault: vi.fn(),
};

vi.mock("@/components/ui/dialog", () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogContent: ({
      children,
      onCloseAutoFocus,
    }: {
      children: React.ReactNode;
      onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
    }) => (
      <>
        {children}
        <button type="button" onClick={() => onCloseAutoFocus?.(closeAutoFocusEvent)}>
          워크스페이스 닫기(테스트)
        </button>
      </>
    ),
    DialogTitle: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
  };
});

vi.mock("@/utils/focus", () => ({
  focusMainInput: vi.fn(() => true),
}));

describe("WorkspacePanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    closeAutoFocusEvent.preventDefault.mockClear();
  });

  it("닫기 핸들러가 onCloseAutoFocus를 통해 main 입력으로 포커스를 시도한다", async () => {
    const focusMainInputMock = vi.mocked(focusMainInput);
    render(
      <>
        <input type="text" data-lum-main-input="true" aria-label="메인 입력" />
        <WorkspacePanel
          currentTabs={[]}
          activeTabId="tab-1"
          workspaces={[]}
          loading={false}
          onSave={vi.fn()}
          onRestore={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "워크스페이스 닫기(테스트)" }));

    expect(closeAutoFocusEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(focusMainInputMock).toHaveBeenCalledTimes(1);
  });
});
