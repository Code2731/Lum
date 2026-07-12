import { describe, expect, it } from "vitest";
import { getModelCatalogMeta, type ModelCatalog } from "./useModelCatalog";

describe("useModelCatalog helpers", () => {
  it("로딩 중에는 카탈로그 대기 메타를 반환한다", () => {
    expect(
      getModelCatalogMeta({ mlx: [], exl2: [], heavy_presets: [] }, true),
    ).toEqual({
      title: "모델 카탈로그 불러오는 중",
      badges: ["먼저 경량 모델", "다음 추론/코딩 모델", "마지막 헤비 프리셋"],
      helper: "온디바이스 실행에 맞는 추천 모델 목록을 읽는 중입니다.",
    });
  });

  it("카탈로그 개수를 엔진별로 요약한다", () => {
    const catalog: ModelCatalog = {
      mlx: [
        {
          repo_id: "mlx-community/Qwen2.5-7B-Instruct-4bit",
          revision: "main",
          label: "Qwen 7B MLX",
          description: "general",
          size_gb: 4.2,
          min_ram_gb: 8,
          category: "general",
        },
      ],
      exl2: [
        {
          repo_id: "bartowski/Qwen2.5-Coder-7B-Instruct-exl2",
          revision: "main",
          label: "Qwen Coder EXL2",
          description: "coding",
          size_gb: 5.1,
          min_ram_gb: 10,
          category: "coding",
        },
        {
          repo_id: "bartowski/DeepSeek-R1-Distill-exl2",
          revision: "main",
          label: "DeepSeek Reasoning",
          description: "reasoning",
          size_gb: 6.2,
          min_ram_gb: 12,
          category: "reasoning",
        },
      ],
      heavy_presets: [
        { label: "Qwen Heavy", id: "qwen-heavy", size: "14GB", tag: "heavy" },
      ],
    };

    expect(getModelCatalogMeta(catalog, false)).toEqual({
      title: "추천 모델 4개 준비됨",
      badges: ["MLX 1개", "EXL2 2개", "헤비 1개"],
      helper: "경량 로컬 모델부터 헤비 프리셋까지 준비 상태를 비교하고 현재 장치에 맞는 구성을 고를 수 있습니다.",
    });
  });

  it("카탈로그가 비면 빈 상태 메타를 반환한다", () => {
    expect(
      getModelCatalogMeta({ mlx: [], exl2: [], heavy_presets: [] }, false),
    ).toEqual({
      title: "추천 모델이 비어 있습니다",
      badges: ["MLX 0개", "EXL2 0개", "헤비 0개"],
      helper: "models.json이 비어 있거나 불러오지 못했습니다. 추천 모델 구성을 확인해 보세요.",
    });
  });
});
