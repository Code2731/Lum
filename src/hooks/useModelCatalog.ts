import { useEffect, useState } from "react";

export type ModelCategory = "coding" | "general" | "reasoning" | "lightweight";

export interface CuratedModel {
  repo_id: string;
  revision: string;
  label: string;
  description: string;
  size_gb: number;
  min_ram_gb: number;
  category: ModelCategory;
  badge?: string;
  capabilities?: { vision?: boolean; reasoning?: boolean };
}

export interface HeavyPreset {
  label: string;
  id: string;
  size: string;
  tag: string;
  /** GGUF 단일 파일명 — 있으면 mistral.rs를 `gguf` 서브커맨드로 시작 (양자화 단계 없음) */
  gguf_file?: string;
}

export interface ModelCatalog {
  mlx: CuratedModel[];
  exl2: CuratedModel[];
  heavy_presets: HeavyPreset[];
}

export interface ModelCatalogMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getModelCatalogMeta(catalog: ModelCatalog, loading: boolean): ModelCatalogMeta {
  if (loading) {
    return {
      title: "모델 카탈로그 불러오는 중",
      badges: ["먼저 경량 모델", "다음 추론/코딩 모델", "마지막 헤비 프리셋"],
      helper: "온디바이스 실행에 맞는 추천 모델 목록을 읽는 중입니다.",
    };
  }

  const mlxCount = catalog.mlx.length;
  const exl2Count = catalog.exl2.length;
  const heavyCount = catalog.heavy_presets.length;
  const total = mlxCount + exl2Count + heavyCount;

  return {
    title: total > 0 ? `추천 모델 ${total}개 준비됨` : "추천 모델이 비어 있습니다",
    badges: [`MLX ${mlxCount}개`, `EXL2 ${exl2Count}개`, `헤비 ${heavyCount}개`],
    helper: total > 0
      ? "경량 로컬 모델부터 헤비 프리셋까지 준비 상태를 비교하고 현재 장치에 맞는 구성을 고를 수 있습니다."
      : "models.json이 비어 있거나 불러오지 못했습니다. 추천 모델 구성을 확인해 보세요.",
  };
}

const EMPTY: ModelCatalog = { mlx: [], exl2: [], heavy_presets: [] };

let cache: ModelCatalog | null = null;
let inflight: Promise<ModelCatalog> | null = null;

async function fetchCatalog(): Promise<ModelCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/models.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`models.json HTTP ${r.status}`);
      return r.json() as Promise<ModelCatalog>;
    })
    .then((data) => {
      cache = {
        mlx: Array.isArray(data?.mlx) ? data.mlx : [],
        exl2: Array.isArray(data?.exl2) ? data.exl2 : [],
        heavy_presets: Array.isArray(data?.heavy_presets) ? data.heavy_presets : [],
      };
      return cache;
    })
    .catch((e) => {
      console.error("[modelCatalog] load failed:", e);
      cache = EMPTY;
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** 컴포넌트 훅: catalog와 로드 상태 반환. 첫 호출 시 fetch, 이후 in-memory 재사용. */
export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog>(cache ?? EMPTY);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setCatalog(cache);
      setLoading(false);
      return;
    }
    let alive = true;
    fetchCatalog().then((c) => {
      if (alive) {
        setCatalog(c);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, []);

  return { catalog, loading };
}
