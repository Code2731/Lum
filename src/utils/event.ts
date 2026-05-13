export function isTextInputTarget(target: EventTarget | null): boolean {
  const el = target;
  if (!(el instanceof Element)) return false;
  if (el instanceof HTMLElement && (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "")) {
    return true;
  }
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    (el instanceof HTMLElement && Boolean(el.isContentEditable))
  );
}
