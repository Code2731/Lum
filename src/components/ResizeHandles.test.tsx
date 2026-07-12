import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import ResizeHandles, { createResizeHandler, RESIZE_HANDLES } from "./ResizeHandles";

const startResizeDragging = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    startResizeDragging,
  }),
}));

describe("ResizeHandles", () => {
  beforeEach(() => {
    startResizeDragging.mockClear();
  });

  it("리사이즈 핸들 메타와 핸들러를 제공한다", () => {
    expect(RESIZE_HANDLES).toHaveLength(8);
    expect(RESIZE_HANDLES[0]?.dir).toBe("North");

    const preventDefault = vi.fn();
    createResizeHandler("SouthEast")({
      preventDefault,
    } as unknown as React.MouseEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(startResizeDragging).toHaveBeenCalledWith("SouthEast");
  });

  it("8개 리사이즈 핸들을 렌더링하고 접근성 트리에서는 숨긴다", () => {
    const { container } = render(<ResizeHandles />);
    const handles = Array.from(container.querySelectorAll("[data-resize-direction]"));

    expect(handles).toHaveLength(8);
    handles.forEach((handle) => {
      expect(handle).toHaveAttribute("aria-hidden", "true");
      expect(handle).toHaveAttribute("tabindex", "-1");
    });
  });

  it("핸들 mousedown 시 해당 방향으로 리사이즈를 시작한다", () => {
    const { container } = render(<ResizeHandles />);
    const eastHandle = container.querySelector('[data-resize-direction="East"]');

    expect(eastHandle).not.toBeNull();
    fireEvent.mouseDown(eastHandle!);

    expect(startResizeDragging).toHaveBeenCalledWith("East");
  });
});
