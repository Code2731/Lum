import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusMainInput } from "./focus";

describe("focusMainInput", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("data-lum-main-input 입력이 있으면 그 입력으로 포커스를 이동한다", () => {
    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    fallbackInput.value = "fallback";
    document.body.appendChild(fallbackInput);

    const mainInput = document.createElement("input");
    mainInput.type = "text";
    mainInput.dataset.lumMainInput = "true";
    document.body.appendChild(mainInput);

    focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(mainInput);
  });

  it("main 입력이 없으면 fallback 텍스트 입력으로 포커스를 이동한다", () => {
    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    document.body.appendChild(fallbackInput);

    focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(fallbackInput);
  });

  it("비활성 메인 입력은 건너뛰고 fallback 입력으로 이동한다", () => {
    const disabledMain = document.createElement("input");
    disabledMain.type = "text";
    disabledMain.dataset.lumMainInput = "true";
    disabledMain.disabled = true;
    document.body.appendChild(disabledMain);

    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    document.body.appendChild(fallbackInput);

    focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(fallbackInput);
  });

  it("숨겨진 메인 입력은 건너뛰고 fallback 입력으로 이동한다", () => {
    const hiddenMain = document.createElement("input");
    hiddenMain.type = "text";
    hiddenMain.dataset.lumMainInput = "true";
    hiddenMain.style.display = "none";
    document.body.appendChild(hiddenMain);

    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    document.body.appendChild(fallbackInput);

    focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(fallbackInput);
  });

  it("aria-hidden 메인 입력은 건너뛰고 fallback 입력으로 이동한다", () => {
    const ariaHiddenMain = document.createElement("input");
    ariaHiddenMain.type = "text";
    ariaHiddenMain.dataset.lumMainInput = "true";
    ariaHiddenMain.setAttribute("aria-hidden", "true");
    document.body.appendChild(ariaHiddenMain);

    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    document.body.appendChild(fallbackInput);

    focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(fallbackInput);
  });

  it("투명도 0 메인 입력은 건너뛰고 fallback 입력으로 이동한다", () => {
    const hiddenMain = document.createElement("input");
    hiddenMain.type = "text";
    hiddenMain.dataset.lumMainInput = "true";
    hiddenMain.style.opacity = "0";
    document.body.appendChild(hiddenMain);

    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    document.body.appendChild(fallbackInput);

    focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(fallbackInput);
  });

  it("비활성 fallback 입력만 있으면 이동하지 않고 false를 반환한다", () => {
    const fallbackInput = document.createElement("input");
    fallbackInput.type = "text";
    fallbackInput.disabled = true;
    document.body.appendChild(fallbackInput);

    const result = focusMainInput({ withAnimationFrame: false });

    expect(document.activeElement).toBe(document.body);
    expect(result).toBe(false);
  });

  it("복원할 입력이 없으면 false를 반환한다", () => {
    const result = focusMainInput({ withAnimationFrame: false });
    expect(result).toBe(false);
  });

  it("기본 동작은 requestAnimationFrame로 포커스를 지연한다", () => {
    const mainInput = document.createElement("input");
    mainInput.type = "text";
    mainInput.dataset.lumMainInput = "true";
    document.body.appendChild(mainInput);

    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    const result = focusMainInput();

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    expect(document.activeElement).toBe(mainInput);
  });

  it("기본 동작에서 포커스 대상이 없으면 false를 반환한다", () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    const result = focusMainInput();

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
