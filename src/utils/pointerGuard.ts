export function isEventTargetWithinSelector(
  target: EventTarget | null,
  selector: string,
): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(selector) != null;
}

export function isPointerOutsideTargets(
  target: Node | null,
  targets: Array<Node | null | undefined>,
): boolean {
  if (!target) return false;
  return targets.every((node) => !(node?.contains(target) ?? false));
}
