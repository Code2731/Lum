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

export function getActiveFocusableIndex(
  focusables: HTMLElement[],
  active: Element | null,
): number {
  if (!(active instanceof HTMLElement)) return -1;
  return focusables.indexOf(active);
}

export interface PointerGuardFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getPointerContainmentFlowSummary(input: {
  inside: boolean;
  targetCount: number;
}): PointerGuardFlowSummary {
  if (input.targetCount <= 0) {
    return {
      primary: "대상 영역 없음",
      secondary: "포인터 판정 보류",
      detail: "비교할 대상 영역이 없어 내부/외부 여부를 확정할 수 없습니다.",
    };
  }

  if (input.inside) {
    return {
      primary: "대상 내부 클릭",
      secondary: `${input.targetCount}개 영역 추적`,
      detail: "현재 포인터 이벤트는 추적 중인 영역 안에서 발생했습니다.",
    };
  }

  return {
    primary: "대상 외부 클릭",
    secondary: `${input.targetCount}개 영역 추적`,
    detail: "현재 포인터 이벤트는 추적 중인 모든 영역 바깥에서 발생했습니다.",
  };
}

export function getActiveFocusFlowSummary(
  focusables: HTMLElement[],
  active: Element | null,
): PointerGuardFlowSummary {
  const index = getActiveFocusableIndex(focusables, active);
  if (focusables.length === 0) {
    return {
      primary: "포커스 대상 없음",
      secondary: "이동 불가",
      detail: "현재 순환 이동할 수 있는 포커스 가능한 요소가 없습니다.",
    };
  }

  if (index < 0) {
    return {
      primary: "포커스 재정렬 필요",
      secondary: `${focusables.length}개 후보`,
      detail: "활성 요소가 현재 포커스 목록에 없어 첫 번째 후보로 재정렬이 필요합니다.",
    };
  }

  return {
    primary: "포커스 위치 확인",
    secondary: `${index + 1}/${focusables.length}`,
    detail: "활성 요소가 현재 포커스 가능한 목록 안에 있습니다.",
  };
}
