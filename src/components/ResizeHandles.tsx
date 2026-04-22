import { useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type React from "react";

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";
type Handle = { dir: ResizeDirection; style: React.CSSProperties };

const EDGE = 5;
const CORNER = 10;

const HANDLES: Handle[] = [
  { dir: "North",     style: { top: 0,    left: CORNER,  right: CORNER,  height: EDGE,   cursor: "n-resize"  } },
  { dir: "South",     style: { bottom: 0, left: CORNER,  right: CORNER,  height: EDGE,   cursor: "s-resize"  } },
  { dir: "West",      style: { left: 0,   top: CORNER,   bottom: CORNER, width: EDGE,    cursor: "w-resize"  } },
  { dir: "East",      style: { right: 0,  top: CORNER,   bottom: CORNER, width: EDGE,    cursor: "e-resize"  } },
  { dir: "NorthWest", style: { top: 0,    left: 0,       width: CORNER,  height: CORNER, cursor: "nw-resize" } },
  { dir: "NorthEast", style: { top: 0,    right: 0,      width: CORNER,  height: CORNER, cursor: "ne-resize" } },
  { dir: "SouthWest", style: { bottom: 0, left: 0,       width: CORNER,  height: CORNER, cursor: "sw-resize" } },
  { dir: "SouthEast", style: { bottom: 0, right: 0,      width: CORNER,  height: CORNER, cursor: "se-resize" } },
];

export default function ResizeHandles() {
  const handlers = useMemo(
    () => Object.fromEntries(
      HANDLES.map(({ dir }) => [
        dir,
        (e: React.MouseEvent) => { e.preventDefault(); getCurrentWindow().startResizeDragging(dir).catch(() => {}); },
      ]),
    ) as Record<ResizeDirection, (e: React.MouseEvent) => void>,
    [],
  );

  return (
    <>
      {HANDLES.map(({ dir, style }) => (
        <div
          key={dir}
          onMouseDown={handlers[dir]}
          style={{ position: "fixed", zIndex: 9999, ...style }}
        />
      ))}
    </>
  );
}
