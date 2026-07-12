import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import InspectorTabPanel, { getInspectorTabPanelFlowSummary } from "./InspectorTabPanel";

describe("InspectorTabPanel", () => {
  it("요약 함수는 탭 라벨 기반 안내를 반환한다", () => {
    expect(getInspectorTabPanelFlowSummary("RAG")).toEqual({
      primary: "인스펙터 탭 확인",
      secondary: "RAG",
      detail: "RAG 내용을 바로 확인하고, 헤더 탭 단축키로 다른 뷰로 빠르게 이동할 수 있습니다.",
    });
  });

  it("현재 탭 문맥과 빠른 전환 안내를 보여준다", () => {
    render(
      <InspectorTabPanel
        id="inspector-tabpanel-rag"
        tabId="inspector-tab-rag"
        label="RAG"
      >
        <div>패널 본문</div>
      </InspectorTabPanel>,
    );

    expect(screen.getByText("인스펙터 탭 확인")).toBeInTheDocument();
    expect(screen.getByText("RAG")).toBeInTheDocument();
    expect(screen.getByText("Alt+숫자 전환")).toBeInTheDocument();
    expect(
      screen.getByText("RAG 내용을 바로 확인하고, 헤더 탭 단축키로 다른 뷰로 빠르게 이동할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("패널 본문")).toBeInTheDocument();
  });
});
