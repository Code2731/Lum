const CODE_FENCE_RE = /```(?:bash|sh|zsh|shell|cmd|powershell|pwsh)?\s*([\s\S]*?)```/gi;

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

function collectFromCodeFence(content: string): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE_RE.exec(content)) !== null) {
    const block = match[1] ?? "";
    const lines = block.split(/\r?\n/);
    for (const rawLine of lines) {
      const candidate = normalizeCandidate(rawLine);
      if (!candidate || candidate.startsWith("#")) continue;
      if (isLikelyShellCommand(candidate)) {
        out.push(candidate);
      }
    }
  }
  return out;
}

export function extractInspectorAnalyzeCommands(content: string, limit = 3): string[] {
  if (!content.trim()) return [];
  const unique = new Set<string>();

  const codeFenceCandidates = collectFromCodeFence(content);
  for (const candidate of codeFenceCandidates) {
    unique.add(candidate);
    if (unique.size >= limit) return [...unique].slice(0, limit);
  }

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const candidate = collectLineCandidate(line);
    if (!candidate) continue;
    unique.add(candidate);
    if (unique.size >= limit) break;
  }

  return [...unique].slice(0, limit);
}
