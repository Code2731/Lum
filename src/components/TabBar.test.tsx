import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TabBar from "./TabBar";

const tabs = [
  {
    id: "tab-1",
    title: "main",
    cwd: "/repo",
    panes: [],
    activePaneId: "pane-1",
    splitDir: null,
    icon: "git",
  },
];

describe("TabBar", () => {
  it("탭 바에는 탭과 분할 조작만 표시한다", () => {
    render(
      <TabBar
        tabs={tabs as any}
        activeTabId="tab-1"
        activeTab={tabs[0] as any}
        tabGitInfo={{ "tab-1": null }}
        renamingTabId={null}
        renameValue=""
        onSwitchTab={vi.fn()}
        onStartRename={vi.fn()}
        onRenameChange={vi.fn()}
        onRenameSubmit={vi.fn()}
        onRenameCancel={vi.fn()}
        onCloseTab={vi.fn()}
        onAddTab={vi.fn()}
        onOpenSshModal={vi.fn()}
        onToggleSplitH={vi.fn()}
        onToggleSplitV={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByLabelText("수평 분할 (Cmd/Ctrl+Shift+D)")).toBeInTheDocument();
    expect(screen.getByLabelText("수직 분할 (Cmd/Ctrl+Shift+E)")).toBeInTheDocument();
    expect(screen.queryByText("먼저 탭 전환")).not.toBeInTheDocument();
  });

  it("탭 aria-label에 작업공간 유형을 포함한다", () => {
    render(
      <TabBar
        tabs={tabs as any}
        activeTabId="tab-1"
        activeTab={tabs[0] as any}
        tabGitInfo={{ "tab-1": null }}
        renamingTabId={null}
        renameValue=""
        onSwitchTab={vi.fn()}
        onStartRename={vi.fn()}
        onRenameChange={vi.fn()}
        onRenameSubmit={vi.fn()}
        onRenameCancel={vi.fn()}
        onCloseTab={vi.fn()}
        onAddTab={vi.fn()}
        onOpenSshModal={vi.fn()}
        onToggleSplitH={vi.fn()}
        onToggleSplitV={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "main 탭 · 일반 터미널" })).toBeInTheDocument();
  });

  it("새 탭 버튼 클릭 시 onAddTab이 호출된다", () => {
    const onAddTab = vi.fn();

    render(
      <TabBar
        tabs={tabs as any}
        activeTabId="tab-1"
        activeTab={tabs[0] as any}
        tabGitInfo={{ "tab-1": null }}
        renamingTabId={null}
        renameValue=""
        onSwitchTab={vi.fn()}
        onStartRename={vi.fn()}
        onRenameChange={vi.fn()}
        onRenameSubmit={vi.fn()}
        onRenameCancel={vi.fn()}
        onCloseTab={vi.fn()}
        onAddTab={onAddTab}
        onOpenSshModal={vi.fn()}
        onToggleSplitH={vi.fn()}
        onToggleSplitV={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));
    expect(onAddTab).toHaveBeenCalledTimes(1);
  });
});
