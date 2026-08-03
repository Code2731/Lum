import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getSectionIntroHeaderTextMeta,
  SectionIntroHeader,
} from "./section-intro-header";

describe("SectionIntroHeader", () => {
  it("제목과 설명 title 메타를 계산한다", () => {
    expect(
      getSectionIntroHeaderTextMeta(
        "빠른 작업",
        "지금 바로 자주 쓰는 흐름으로 이동합니다.",
      ),
    ).toEqual({
      titleTitle: "빠른 작업",
      descriptionTitle: "지금 바로 자주 쓰는 흐름으로 이동합니다.",
    });
  });

  it("제목과 설명을 구조적으로 렌더링한다", () => {
    render(
      <SectionIntroHeader
        title="빠른 작업"
        description="지금 바로 자주 쓰는 흐름으로 이동합니다."
      />,
    );

    expect(screen.getByRole("group", { name: "빠른 작업" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "빠른 작업" })).toHaveAttribute("title", "빠른 작업");
    expect(screen.getByText("지금 바로 자주 쓰는 흐름으로 이동합니다.")).toHaveAttribute(
      "title",
      "지금 바로 자주 쓰는 흐름으로 이동합니다.",
    );
  });

  it("보조 영역을 함께 렌더링한다", () => {
    render(
      <SectionIntroHeader
        title="추천"
        description="지금 적합한 흐름을 보여줍니다."
        aside={<span>바로 시작</span>}
      />,
    );

    expect(screen.getByText("바로 시작")).toBeInTheDocument();
  });
});
