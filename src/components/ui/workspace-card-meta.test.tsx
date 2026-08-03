import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getWorkspaceCardMetaSummary, WorkspaceCardMeta } from "./workspace-card-meta";

describe("WorkspaceCardMeta", () => {
  const tabs = [
    { id: "1", title: "백엔드", cwd: "/Users/test/project/backend" },
    { id: "2", title: "프론트", cwd: "/Users/test/project/frontend" },
  ];

  it("작업공간 메타 요약 문자열을 계산한다", () => {
    expect(getWorkspaceCardMetaSummary(tabs as any, 3, "방금")).toBe(
      "작업공간 메타 정보: 탭 2개, 프로젝트 2곳, 복원 3회, 마지막 복원 방금",
    );

    expect(getWorkspaceCardMetaSummary(tabs.slice(0, 1) as any)).toBe(
      "작업공간 메타 정보: 탭 1개, 프로젝트 1곳",
    );
  });

  it("작업공간 메타 정보를 구조적으로 렌더링한다", () => {
    render(
      <WorkspaceCardMeta
        tabs={tabs as any}
        restoreCount={3}
        lastRestoredLabel="방금"
        pathLabel="주 경로"
        projectSummaryClassName="project-summary"
        recentTabsClassName="recent-tabs"
        pathClassName="path"
        lastRestoredClassName="last-restored"
      />,
    );

    expect(
      screen.getByRole("list", {
        name: "작업공간 메타 정보: 탭 2개, 프로젝트 2곳, 복원 3회, 마지막 복원 방금",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("탭 2개 · 프로젝트 2곳 · 복원 3회")).toHaveAttribute("title", "탭 2개 · 프로젝트 2곳 · 복원 3회");
    expect(screen.getByText("최근 탭 · 백엔드, 프론트")).toHaveAttribute("title", "최근 탭 · 백엔드, 프론트");
    expect(screen.getByText("~/project/backend")).toHaveAttribute("title", "주 경로 · ~/project/backend");
    expect(screen.getByText("마지막 복원 · 방금")).toHaveAttribute("title", "마지막 복원 · 방금");
  });

  it("옵션이 없으면 필요한 메타만 렌더링한다", () => {
    render(
      <WorkspaceCardMeta
        tabs={tabs.slice(0, 1) as any}
        showProjectSummaryFirst
        projectSummaryClassName="project-summary"
        recentTabsClassName="recent-tabs"
        pathClassName="path"
        lastRestoredClassName="last-restored"
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("탭 1개 · 프로젝트 1곳")).toBeInTheDocument();
    expect(screen.queryByText(/마지막 복원/)).not.toBeInTheDocument();
  });
});
