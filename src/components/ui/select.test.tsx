import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getSelectTriggerAccessibleText,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select";

describe("Select", () => {
  it("title/aria-label 기반 트리거 title 힌트를 계산한다", () => {
    expect(getSelectTriggerAccessibleText({ ariaLabel: "모델 선택" })).toEqual({
      title: "모델 선택",
    });
    expect(
      getSelectTriggerAccessibleText({
        title: "추론 모델 선택",
        ariaLabel: "모델 선택",
      }),
    ).toEqual({
      title: "추론 모델 선택",
    });
  });

  it("트리거에 공통 포커스/비활성/busy 상태 클래스를 제공한다", () => {
    render(
      <Select>
        <SelectTrigger aria-label="모델 선택" disabled aria-busy="true">
          <SelectValue placeholder="선택" />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "모델 선택" });
    expect(trigger.className).toContain("focus-visible:ring-1");
    expect(trigger.className).toContain("disabled:pointer-events-none");
    expect(trigger.className).toContain("disabled:bg-white/[0.03]");
    expect(trigger.className).toContain("aria-[busy=true]:cursor-progress");
    expect(trigger.className).toContain("aria-[busy=true]:opacity-70");
    expect(trigger).toHaveAttribute("title", "모델 선택");
  });

  it("항목에 포커스 링 상태 클래스를 제공한다", () => {
    render(
      <Select open defaultValue="qwen">
        <SelectTrigger aria-label="모델">
          <SelectValue placeholder="선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="qwen">Qwen</SelectItem>
        </SelectContent>
      </Select>,
    );

    const item = screen.getByRole("option", { name: "Qwen" });
    expect(item.className).toContain("focus-visible:ring-1");
    expect(item.className).toContain("focus-visible:ring-ring");
  });
});
