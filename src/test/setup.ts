import "@testing-library/jest-dom/vitest";

// @xyflow/react(InfiniteCanvas)가 jsdom에서 ResizeObserver를 요구하므로 폴리필
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
