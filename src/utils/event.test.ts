import { describe, expect, it } from "vitest";
import { isTextInputTarget } from "./event";

describe("isTextInputTarget", () => {
  const appendAndCleanup = (nodes: HTMLElement[]) => {
    nodes.forEach((node) => document.body.appendChild(node));
    return () => nodes.forEach((node) => node.remove());
  };

  it("INPUT과 TEXTAREA는 텍스트 입력 대상으로 판정한다", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const button = document.createElement("button");
    const cleanup = appendAndCleanup([input, textarea, button]);

    expect(isTextInputTarget(input)).toBe(true);
    expect(isTextInputTarget(textarea)).toBe(true);
    expect(isTextInputTarget(button)).toBe(false);
    cleanup();
  });

  it("contenteditable 요소는 텍스트 입력 대상으로 판정한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    const cleanup = appendAndCleanup([wrapper]);

    expect(isTextInputTarget(wrapper)).toBe(true);
    cleanup();
  });

  it("contenteditable 내부 자식도 텍스트 입력 대상으로 판정한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    wrapper.appendChild(child);
    const cleanup = appendAndCleanup([wrapper]);

    expect(isTextInputTarget(child)).toBe(true);
    cleanup();
  });

  it("text input이 아닌 요소와 null은 제외한다", () => {
    const div = document.createElement("div");
    expect(isTextInputTarget(div)).toBe(false);
    expect(isTextInputTarget(null)).toBe(false);
  });

  it("readonly 입력은 텍스트 입력 대상으로 제외한다", () => {
    const input = document.createElement("input");
    input.readOnly = true;
    const cleanup = appendAndCleanup([input]);
    expect(isTextInputTarget(input)).toBe(false);
    cleanup();
  });

  it("disabled 입력은 텍스트 입력 대상으로 제외한다", () => {
    const input = document.createElement("input");
    input.disabled = true;
    const cleanup = appendAndCleanup([input]);
    expect(isTextInputTarget(input)).toBe(false);
    cleanup();
  });

  it("disabled textarea는 텍스트 입력 대상으로 제외한다", () => {
    const textarea = document.createElement("textarea");
    textarea.disabled = true;
    const cleanup = appendAndCleanup([textarea]);
    expect(isTextInputTarget(textarea)).toBe(false);
    cleanup();
  });

  it("hidden 입력은 텍스트 입력 대상으로 제외한다", () => {
    const input = document.createElement("input");
    input.type = "hidden";
    const cleanup = appendAndCleanup([input]);
    expect(isTextInputTarget(input)).toBe(false);
    cleanup();
  });

  it("role=combobox 자손도 텍스트 입력 대상으로 판정한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("role", "combobox");
    const child = document.createElement("button");
    wrapper.appendChild(child);
    const cleanup = appendAndCleanup([wrapper]);

    expect(isTextInputTarget(child)).toBe(true);
    cleanup();
  });

  it("aria-disabled role=textbox는 텍스트 입력 대상으로 제외한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("role", "textbox");
    wrapper.setAttribute("aria-disabled", "true");
    const child = document.createElement("span");
    wrapper.appendChild(child);
    const cleanup = appendAndCleanup([wrapper]);

    expect(isTextInputTarget(child)).toBe(false);
    expect(isTextInputTarget(wrapper)).toBe(false);
    cleanup();
  });

  it("contenteditable=''와 plaintext-only도 텍스트 입력 대상으로 판정한다", () => {
    const editableEmpty = document.createElement("div");
    editableEmpty.setAttribute("contenteditable", "");
    const editablePlainText = document.createElement("div");
    editablePlainText.setAttribute("contenteditable", "plaintext-only");
    const cleanup = appendAndCleanup([editableEmpty, editablePlainText]);

    expect(isTextInputTarget(editableEmpty)).toBe(true);
    expect(isTextInputTarget(editablePlainText)).toBe(true);
    cleanup();
  });

  it("contenteditable='false'는 텍스트 입력으로 판정하지 않는다", () => {
    const editableFalse = document.createElement("div");
    editableFalse.setAttribute("contenteditable", "false");
    const cleanup = appendAndCleanup([editableFalse]);

    expect(isTextInputTarget(editableFalse)).toBe(false);
    cleanup();
  });

  it("contenteditable='false' 내부 자식도 텍스트 입력으로 판정하지 않는다", () => {
    const editableFalse = document.createElement("div");
    editableFalse.setAttribute("contenteditable", "false");
    const child = document.createElement("span");
    editableFalse.appendChild(child);
    const cleanup = appendAndCleanup([editableFalse]);

    expect(isTextInputTarget(child)).toBe(false);
    cleanup();
  });

  it("checkbox/button/search처럼 텍스트 입력 외 타입은 제외한다", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const button = document.createElement("input");
    button.type = "button";
    const submit = document.createElement("input");
    submit.type = "submit";
    const reset = document.createElement("input");
    reset.type = "reset";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    const cleanup = appendAndCleanup([checkbox, button, submit, reset, fileInput]);

    expect(isTextInputTarget(checkbox)).toBe(false);
    expect(isTextInputTarget(button)).toBe(false);
    expect(isTextInputTarget(submit)).toBe(false);
    expect(isTextInputTarget(reset)).toBe(false);
    expect(isTextInputTarget(fileInput)).toBe(false);
    cleanup();
  });
});
