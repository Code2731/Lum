import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorPanelHeader from "./InspectorPanelHeader";
import type { InspectorTab, InspectorTabItem } from "./InspectorPanel/types";

const baseTabs: InspectorTabItem[] = [
  { id: "summary", label: "요약", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
];

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorPanelHeader>> = {}) {
  return {
    inspectorDensity: "cozy" as const,
    inspectorTab: "summary" as InspectorTab,
    inspectorTabs: baseTabs,
    inspectorTabRefs: { current: {} as Record<InspectorTab, HTMLButtonElement | null> },
    onDensityToggle: vi.fn(),
    onClose: vi.fn(),
    onTabSelect: vi.fn(),
    onTabKeyDown: vi.fn(),
    ...overrides,
  };
}

describe("InspectorPanelHeader", () => {
  it("헤더 제목과 기본 탭들을 렌더링한다", () => {
    render(<InspectorPanelHeader {...createProps()} />);

    expect(screen.getByText("Inspector")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /요약/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /RAG/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Scripts/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /System/ })).toBeInTheDocument();
  });

  it("밀도 토글은 현재 모드 라벨과 title을 반영하고 콜백을 호출한다", () => {
    const onDensityToggle = vi.fn();
    render(
      <InspectorPanelHeader
        {...createProps({
          inspectorDensity: "compact",
          onDensityToggle,
        })}
      />,
    );

    expect(screen.getByText("COMPACT")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspector 밀도 토글")).toHaveAttribute("title", "Cozy 보기");
    fireEvent.click(screen.getByLabelText("Inspector 밀도 토글"));
    expect(onDensityToggle).toHaveBeenCalledTimes(1);
  });

  it("닫기 버튼은 onClose를 호출한다", () => {
    const onClose = vi.fn();
    render(<InspectorPanelHeader {...createProps({ onClose })} />);

    fireEvent.click(screen.getByLabelText("Inspector 닫기"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("탭 리스트 keydown은 onTabKeyDown으로 전달된다", () => {
    const onTabKeyDown = vi.fn();
    render(<InspectorPanelHeader {...createProps({ onTabKeyDown })} />);

    fireEvent.keyDown(screen.getByRole("tablist", { name: "Inspector 탭" }), { key: "ArrowRight" });
    expect(onTabKeyDown).toHaveBeenCalledTimes(1);
  });

  it("활성 탭은 aria-selected=true와 tabIndex 0을 가진다", () => {
    render(<InspectorPanelHeader {...createProps({ inspectorTab: "summary" })} />);

    expect(screen.getByRole("tab", { name: /요약/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /요약/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("tabindex", "-1");
  });

  it("탭 버튼은 aria-controls, aria-keyshortcuts, title을 노출한다", () => {
    render(<InspectorPanelHeader {...createProps()} />);

    const ragTab = screen.getByRole("tab", { name: /RAG/ });
    expect(ragTab).toHaveAttribute("aria-controls", "inspector-tabpanel-rag");
    expect(ragTab).toHaveAttribute("aria-keyshortcuts", "Alt+2");
    expect(ragTab).toHaveAttribute("title", "Alt+2 : RAG");
  });

  it("탭 클릭과 Enter/Space 입력은 onTabSelect를 호출한다", () => {
    const onTabSelect = vi.fn();
    render(<InspectorPanelHeader {...createProps({ onTabSelect })} />);

    fireEvent.click(screen.getByRole("tab", { name: /RAG/ }));
    fireEvent.keyDown(screen.getByRole("tab", { name: /Scripts/ }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("tab", { name: /System/ }), { key: " " });

    expect(onTabSelect).toHaveBeenNthCalledWith(1, "rag");
    expect(onTabSelect).toHaveBeenNthCalledWith(2, "scripts");
    expect(onTabSelect).toHaveBeenNthCalledWith(3, "sysmon");
  });

  it("탭 ref 맵은 렌더된 탭 버튼 DOM을 보관한다", () => {
    const inspectorTabRefs = { current: {} as Record<InspectorTab, HTMLButtonElement | null> };
    render(<InspectorPanelHeader {...createProps({ inspectorTabRefs })} />);

    expect(inspectorTabRefs.current.summary).toBe(screen.getByRole("tab", { name: /요약/ }));
    expect(inspectorTabRefs.current.rag).toBe(screen.getByRole("tab", { name: /RAG/ }));
    expect(inspectorTabRefs.current.scripts).toBe(screen.getByRole("tab", { name: /Scripts/ }));
    expect(inspectorTabRefs.current.sysmon).toBe(screen.getByRole("tab", { name: /System/ }));
  });
});
