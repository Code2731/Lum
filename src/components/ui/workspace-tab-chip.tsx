import { TerminalSquare } from "lucide-react";
import { shortPath } from "@/utils";

interface WorkspaceTabChipProps {
  title: string;
  cwd?: string;
  active?: boolean;
  compact?: boolean;
  pathMaxWidthClassName?: string;
}

export function getWorkspaceTabChipAccessibleLabel(
  title: string,
  cwd?: string,
  active = false,
): string {
  const base = active ? "현재 작업공간 탭" : "작업공간 탭";
  return cwd ? `${base}: ${title}, ${shortPath(cwd)}` : `${base}: ${title}`;
}

export function WorkspaceTabChip({
  title,
  cwd,
  active = false,
  compact = false,
  pathMaxWidthClassName,
}: WorkspaceTabChipProps) {
  const chipTitle = cwd
    ? `${title} · ${shortPath(cwd)}`
    : title;
  const accessibleLabel = getWorkspaceTabChipAccessibleLabel(title, cwd, active);
  const baseClassName = compact
    ? "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-white/4 text-white/35"
    : active
      ? "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-accent/15 text-accent"
      : "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-white/5 text-white/40";
  const pathClassName = compact
    ? `font-mono text-white/20 truncate ${pathMaxWidthClassName ?? "max-w-[60px]"}`
    : `font-mono text-white/25 truncate ${pathMaxWidthClassName ?? "max-w-[80px]"}`;

  return (
    <span
      role="status"
      aria-label={accessibleLabel}
      title={chipTitle}
      className={baseClassName}
    >
      <TerminalSquare size={compact ? 7 : 8} />
      {title}
      {cwd && <span className={pathClassName}>{shortPath(cwd)}</span>}
    </span>
  );
}
