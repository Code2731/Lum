export function isEventTargetWithinSelector(
  target: EventTarget | null,
  selector: string,
): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(selector) != null;
}

export function isPointerOutsideTargets(
  target: EventTarget | null,
  targets: Array<Node | null | undefined>,
): boolean {
  if (!(target instanceof Node)) return false;
  return targets.every((node) => !(node?.contains(target) ?? false));
}

export function isTargetInsideTargets(
  target: EventTarget | null,
  targets: Array<Node | null | undefined>,
): boolean {
  if (!(target instanceof Node)) return false;
  return targets.some((node) => node?.contains(target) ?? false);
}
