import { getSpec } from "../data/cliSpecs";

export interface GhostSuggestion {
  suffix: string;  // text shown as ghost (dimmed)
  insert: string;  // text sent to PTY on Tab
}

/**
 * Given the current input line, return a ghost text completion or null.
 * Handles:
 *   - `git <partial-subcommand>` → complete subcommand
 *   - `git commit -<partial-flag>` → complete flag
 *   - `<tool> --<partial-flag>` for flag-only tools (ls, grep, curl, etc.)
 */
export function findCompletion(input: string): GhostSuggestion | null {
  const trimmed = input.trimStart();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  const tool = tokens[0];
  const spec = getSpec(tool);
  if (!spec) return null;

  // Flag-only tools (no subcommands, just globalFlags)
  if (spec.subcommands.length === 0 && spec.globalFlags) {
    const partial = tokens[tokens.length - 1];
    if (partial.startsWith("-") && partial !== tokens[0]) {
      return matchFlag(partial, spec.globalFlags);
    }
    return null;
  }

  // Tools with subcommands
  if (tokens.length === 1) return null; // just the tool name, nothing to complete

  const subArg = tokens[1];
  const rest = tokens.slice(2);

  // Completing the subcommand itself
  if (tokens.length === 2) {
    const match = spec.subcommands.find(
      (s) => s.name.startsWith(subArg) && s.name !== subArg
    );
    if (match) {
      const suffix = match.name.slice(subArg.length);
      return { suffix, insert: suffix };
    }
    return null;
  }

  // Completing a flag after a known subcommand
  const sub = spec.subcommands.find((s) => s.name === subArg);
  if (!sub) return null;

  const partial = rest[rest.length - 1];
  if (!partial.startsWith("-")) return null;

  const flags = [...(sub.flags ?? []), ...(spec.globalFlags ?? [])];
  return matchFlag(partial, flags);
}

function matchFlag(
  partial: string,
  flags: { flag: string; description: string }[]
): GhostSuggestion | null {
  const match = flags.find(
    (f) => f.flag.startsWith(partial) && f.flag !== partial
  );
  if (!match) return null;
  const suffix = match.flag.slice(partial.length);
  return { suffix, insert: suffix };
}

