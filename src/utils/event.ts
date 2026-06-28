export function isTextInputTarget(target: EventTarget | null): boolean {
  const el = target;
  if (!(el instanceof Element)) return false;

  const isAriaDisabled = (node: Element | null): boolean => {
    if (!node) return false;
    if (node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true") return true;
    return false;
  };

  if (el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly || el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.type === "button" || el.type === "submit" || el.type === "reset" || el.type === "file") {
      return false;
    }
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled;
  }

  const editableNode = el.closest("textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only'], [role='textbox'], [role='searchbox'], [role='combobox']");
  if (editableNode && isAriaDisabled(editableNode)) {
    return false;
  }

  if (editableNode) {
    return true;
  }

  if (el.closest("input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='file'])")) {
    return true;
  }

  return false;
}
