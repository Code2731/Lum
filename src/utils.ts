/**
 * 파일 경로에서 마지막 디렉토리/파일명만 추출
 */
export const shortPath = (p: string): string => {
  if (!p) return "~";
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.filter(Boolean).pop() || "~";
};

/**
 * 두 벡터 간의 코사인 유사도 계산
 */
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
