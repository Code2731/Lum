import { describe, expect, it } from "vitest";
import { isTextInputTarget } from "./event";

describe("isTextInputTarget", () => {
  it("INPUT과 TEXTAREA는 텍스트 입력 대상으로 판정한다", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const button = document.createElement("button");

    expect(isTextInputTarget(input)).toBe(true);
    expect(isTextInputTarget(textarea)).toBe(true);
    expect(isTextInputTarget(button)).toBe(false);
  });

  it("contenteditable 요소는 텍스트 입력 대상으로 판정한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    document.body.appendChild(wrapper);

    expect(isTextInputTarget(wrapper)).toBe(true);
  });

  it("contenteditable 내부 자식도 텍스트 입력 대상으로 판정한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);

    expect(isTextInputTarget(child)).toBe(true);
  });

  it("text input이 아닌 요소와 null은 제외한다", () => {
    const div = document.createElement("div");
    expect(isTextInputTarget(div)).toBe(false);
    expect(isTextInputTarget(null)).toBe(false);
  });

  it("readonly 입력은 텍스트 입력 대상으로 제외한다", () => {
    const input = document.createElement("input");
    input.readOnly = true;
    expect(isTextInputTarget(input)).toBe(false);
  });

  it("hidden 입력은 텍스트 입력 대상으로 제외한다", () => {
    const input = document.createElement("input");
    input.type = "hidden";
    expect(isTextInputTarget(input)).toBe(false);
  });

  it("role=combobox 자손도 텍스트 입력 대상으로 판정한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("role", "combobox");
    const child = document.createElement("button");
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);

    expect(isTextInputTarget(child)).toBe(true);
  });
});
