import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";
type Handle = { dir: ResizeDirection; style: React.CSSProperties };

const EDGE = 5;   // px — 가장자리 핸들 두께
const CORNER = 10; // px — 모서리 핸들 크기

const HANDLES: Handle[] = [
  // 가장자리
  { dir: "North",     style: { top: 0,    left: CORNER,        right: CORNER,        height: EDGE,  cursor: "n-resize" } },
  { dir: "South",     style: { bottom: 0, left: CORNER,        right: CORNER,        height: EDGE,  cursor: "s-resize" } },
  { dir: "West",      style: { left: 0,   top: CORNER,         bottom: CORNER,       width: EDGE,   cursor: "w-resize" } },
  { dir: "East",      style: { right: 0,  top: CORNER,         bottom: CORNER,       width: EDGE,   cursor: "e-resize" } },
  // 모서리
  { dir: "NorthWest", style: { top: 0,    left: 0,             width: CORNER,        height: CORNER, cursor: "nw-resize" } },
  { dir: "NorthEast", style: { top: 0,    right: 0,            width: CORNER,        height: CORNER, cursor: "ne-resize" } },
  { dir: "SouthWest", style: { bottom: 0, left: 0,             width: CORNER,        height: CORNER, cursor: "sw-resize" } },
  { dir: "SouthEast", style: { bottom: 0, right: 0,            width: CORNER,        height: CORNER, cursor: "se-resize" } },
];

export default function ResizeHandles() {
  const handleMouseDown = (dir: ResizeDirection) => (e: React.MouseEvent) => {
    e.preventDefault();
    getCurrentWindow().startResizeDragging(dir).catch(() => {});
  };

  return (
    <>
      {HANDLES.map(({ dir, style }) => (
        <div
          key={dir}
          onMouseDown={handleMouseDown(dir)}
          style={{ position: "fixed", zIndex: 9999, ...style }}
        />
      ))}
    </>
  );
}
