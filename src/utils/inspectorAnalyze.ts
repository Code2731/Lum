function normalizeCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[$>#]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyShellCommand(candidate: string): boolean {
  if (!candidate) return false;
  if (candidate.length > 240) return false;
  const firstToken = candidate.split(/\s+/)[0] ?? "";
  if (!firstToken) return false;
  if (!/^[a-zA-Z0-9_./:@%+-]+$/.test(firstToken)) return false;
  return true;
}

function collectLineCandidate(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;

  const promptMatch = line.match(/^(?:[-*]\s*)?(?:\d+[.)]\s*)?\$\s+(.+)$/);
  if (promptMatch?.[1]) {
    const candidate = normalizeCandidate(promptMatch[1]);
    return isLikelyShellCommand(candidate) ? candidate : null;
  }

  const inlineCodeMatch = line.match(/^(?:[-*]\s*)?(?:\d+[.)]\s*)?`([^`\n]+)`/);
  if (inlineCodeMatch?.[1]) {
    const candidate = normalizeCandidate(inlineCodeMatch[1]);
    return isLikelyShellCommand(candidate) ? candidate : null;
  }

  return null;
}

export function extractInspectorAnalyzeCommands(content: string, limit = 3): string[] {
  if (!content.trim()) return [];
  const unique = new Set<string>();

  const lines = content.split(/\r?\n/);
  let inCodeFence = false;
  for (const line of lines) {
    const fenceMatch = line.trim().match(/^```(?:bash|sh|zsh|shell|cmd|powershell|pwsh)?\s*$/i);
    if (fenceMatch) {
      inCodeFence = !inCodeFence;
      continue;
    }

    const candidate = inCodeFence
      ? (() => {
          const normalized = normalizeCandidate(line);
          if (!normalized || normalized.startsWith("#")) return null;
          return isLikelyShellCommand(normalized) ? normalized : null;
        })()
      : collectLineCandidate(line);
    if (!candidate) continue;
    unique.add(candidate);
    if (unique.size >= limit) break;
  }

  return [...unique].slice(0, limit);
}
