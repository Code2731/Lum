export const parsePathComponents = (p: string): { dir: string; file: string } => {
  const sep = p.includes("\\") ? "\\" : "/";
  const idx = p.lastIndexOf(sep);
  return { dir: p.slice(0, idx), file: p.slice(idx + 1) };
};

export const shortPath = (p: string): string => {
  if (!p) return "~";
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.filter(Boolean).pop() || "~";
};

export const parseLoadedKey = (key: string): { base: string; lora: string; isq: string } => {
  if (key.includes("+lora:")) {
    const idx = key.indexOf("+lora:");
    return { base: key.slice(0, idx), lora: key.slice(idx + 6), isq: "" };
  }
  if (key.includes("+isq:")) {
    const idx = key.indexOf("+isq:");
    return { base: key.slice(0, idx), lora: "", isq: key.slice(idx + 5) };
  }
  return { base: key, lora: "", isq: "" };
};

export const normalizeBlockId = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.replace(/^\uFEFF+/, "").trim();
  return normalized === "" ? null : normalized;
};

/** ko-KR 짧은 날짜시간 — workspace/squad/healing 패널 공용. unit으로 초/밀리초 자동 처리. */
export const fmtShortDate = (ts: number, unit: "s" | "ms" = "s"): string => {
  const ms = unit === "s" ? ts * 1000 : ts;
  return new Date(ms).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
};
