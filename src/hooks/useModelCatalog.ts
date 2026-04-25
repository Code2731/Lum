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
}

export interface ModelCatalog {
  mlx: CuratedModel[];
  exl2: CuratedModel[];
  heavy_presets: HeavyPreset[];
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
