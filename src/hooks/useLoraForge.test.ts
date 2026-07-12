import { describe, expect, it } from "vitest";
import {
  getLoraForgeMeta,
  type AutoTrainStatus,
  type ForgeRun,
} from "./useLoraForge";

describe("useLoraForge helpers", () => {
  it("run이 없으면 초기 학습 흐름 메타를 반환한다", () => {
    expect(
      getLoraForgeMeta({
        runs: [],
        autoStatus: null,
        liveLogs: {},
      }),
    ).toEqual({
      title: "LoRA 학습 run이 없습니다",
      badges: ["실행 중 0개", "자동 학습 준비", "라이브 로그 대기"],
      helper: "첫 학습 run을 시작하면 런타임, 자동 학습 상태, 라이브 로그를 여기서 함께 추적할 수 있습니다.",
    });
  });

  it("실행 중 run과 라이브 로그 수를 함께 요약한다", () => {
    const runs: ForgeRun[] = [
      {
        id: "r1",
        task: "healing fine-tune",
        runtime: "mlx-lm",
        base_model: "Qwen/Qwen2.5-Coder-7B",
        dataset_path: "/tmp/data.jsonl",
        output_dir: "/tmp/out",
        iters: 100,
        lora_rank: 16,
        learning_rate: 0.0001,
        ts_started_ms: 1,
        ts_ended_ms: null,
        status: "running",
        exit_code: null,
        log_tail: [],
      },
      {
        id: "r2",
        task: "recall tune",
        runtime: "axolotl",
        base_model: "Qwen/Qwen2.5-3B",
        dataset_path: "/tmp/data2.jsonl",
        output_dir: "/tmp/out2",
        iters: 80,
        lora_rank: 8,
        learning_rate: 0.0002,
        ts_started_ms: 2,
        ts_ended_ms: 3,
        status: "completed",
        exit_code: 0,
        log_tail: [],
      },
    ];
    const autoStatus: AutoTrainStatus = {
      enabled: true,
      threshold: 10,
      unlearned_count: 4,
      cursor_ms: 100,
      running: true,
      blocked_reason: null,
    };

    expect(
      getLoraForgeMeta({
        runs,
        autoStatus,
        liveLogs: { r1: ["step 1"], r2: [] },
      }),
    ).toEqual({
      title: "LoRA 학습 run 2개",
      badges: ["실행 중 1개", "자동 학습 준비", "라이브 로그 1개"],
      helper: "학습 run 상태와 라이브 로그를 보면서 수동/자동 학습 흐름을 함께 추적할 수 있습니다.",
    });
  });

  it("자동 학습이 차단되면 차단 사유 중심 메타를 반환한다", () => {
    expect(
      getLoraForgeMeta({
        runs: [],
        autoStatus: {
          enabled: true,
          threshold: 5,
          unlearned_count: 5,
          cursor_ms: 10,
          running: false,
          blocked_reason: "base model missing",
        },
        liveLogs: {},
      }),
    ).toEqual({
      title: "LoRA 학습 run이 없습니다",
      badges: ["실행 중 0개", "자동 학습 대기", "라이브 로그 대기"],
      helper: "자동 학습은 현재 base model missing 때문에 대기 중입니다. 수동 run은 바로 시작할 수 있습니다.",
    });
  });
});
