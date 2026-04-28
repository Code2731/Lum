import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { vi } from "vitest";

// @xyflow/react(InfiniteCanvas)가 jsdom에서 ResizeObserver를 요구하므로 폴리필
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

// 컴포넌트 단독 테스트가 IconButton(내장 Tooltip) 사용 시 TooltipProvider 누락으로
// `Tooltip must be used within TooltipProvider` 에러 → testing-library의 render를
// 글로벌 wrap해서 모든 테스트에서 자동으로 TooltipProvider 컨텍스트 제공.
vi.mock("@testing-library/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@testing-library/react")>();
  const { TooltipProvider } = await import("../components/ui/tooltip");
  return {
    ...actual,
    render: (ui: React.ReactElement, options?: Parameters<typeof actual.render>[1]) =>
      actual.render(<TooltipProvider>{ui}</TooltipProvider>, options),
  };
});
