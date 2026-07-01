interface FocusMainInputOptions {
  withAnimationFrame?: boolean;
  skipDisabled?: boolean;
}

const MAIN_INPUT_SELECTOR = "[data-lum-main-input='true']";
const FALLBACK_INPUT_SELECTOR =
  "input[type='text']:not([data-lum-main-input='true']):not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='file'])";

function isHidden(element: HTMLElement): boolean {
  const { display, visibility, opacity } = getComputedStyle(element);
  const hiddenByHiddenAttr = element.hasAttribute("hidden");
  const hiddenByAriaHidden = element.getAttribute("aria-hidden") === "true";
  return hiddenByHiddenAttr || hiddenByAriaHidden || display === "none" || visibility === "hidden" || Number(opacity) === 0;
}

function isUsableInput(input: HTMLInputElement, skipDisabled: boolean): boolean {
  if (skipDisabled && input.disabled) {
    return false;
  }
  if (isHidden(input)) {
    return false;
  }
  return true;
}

export function focusMainInput({
  withAnimationFrame = true,
  skipDisabled = true,
}: FocusMainInputOptions = {}): boolean {
  const findUsableInput = () => {
    const mainInput = document.querySelector<HTMLInputElement>(MAIN_INPUT_SELECTOR);
    if (mainInput && isUsableInput(mainInput, skipDisabled)) {
      return mainInput;
    }

    const fallbackInput = document.querySelector<HTMLInputElement>(FALLBACK_INPUT_SELECTOR);
    if (fallbackInput && isUsableInput(fallbackInput, skipDisabled)) {
      return fallbackInput;
    }

    return null;
  };

  const applyFocus = () => {
    const target = findUsableInput();
    if (!target) {
      return false;
    }
    target.focus();
    return true;
  };

  if (typeof window === "undefined") {
    return false;
  }

  if (withAnimationFrame) {
    const canFocus = !!findUsableInput();
    window.requestAnimationFrame(() => {
      applyFocus();
    });
    return canFocus;
  }

  return applyFocus();
}
