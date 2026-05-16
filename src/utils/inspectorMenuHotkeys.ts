export type InspectorMenuHotkeyAction = "run" | "copy" | "load" | null;

export function resolveInspectorMenuHotkey(
  key: string,
  menuOpen: boolean,
): InspectorMenuHotkeyAction {
  const lower = key.toLowerCase();
  if (lower === "r") return "run";
  if (!menuOpen) return null;
  if (lower === "c") return "copy";
  if (lower === "l") return "load";
  return null;
}
