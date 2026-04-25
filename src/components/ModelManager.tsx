import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Trash2, X, HardDrive, Cpu, ExternalLink, Play, CheckCircle2, XCircle } from "lucide-react";

interface LocalModel {
  id: string;
  size_mb: number;
  path: string;
}

interface DownloadProgress {
  repo_id: string;
  file: string;
  downloaded: number;
  total: number;
  done: boolean;
  /** 프론트엔드가 누적 집계 — 지금까지 완료된 파일 수 */
  _filesCompleted?: number;
  /** 프론트엔드가 누적 집계 — 지금까지 다운받은 총 바이트 (완료된 파일 합) */
  _totalDownloaded?: number;
  _seenFiles?: string[];
}

type ModelCategory = "coding" | "general" | "reasoning" | "lightweight";

interface CuratedModel {
  repo_id: string;
  revision: string;
  label: string;
  description: string;
  size_gb: number;
  min_ram_gb: number;
  category: ModelCategory;
  badge?: string;
  /** 모델 고유 기능 — 켜고 끄는 건 XllmPanel의 전역 토글 */
  capabilities?: {
    vision?: boolean;     // 이미지 입력 지원 (VL·멀티모달)
    reasoning?: boolean;  // chain-of-thought / think 토큰 생성
  };
}

const CATEGORY_META: Record<ModelCategory, { icon: string; label: string }> = {
  coding:     { icon: "💻", label: "코딩" },
  general:    { icon: "🌐", label: "범용" },
  reasoning:  { icon: "🧠", label: "추론" },
  lightweight:{ icon: "⚡", label: "경량" },
};

// ── Apple Silicon (MLX) ───────────────────────────────────────────
// mlx-community HuggingFace 레포에서 자동 다운로드.
// 직접 입력란에 mlx-community/model-name 형식으로 다른 모델도 사용 가능.
const MLX_MODELS: CuratedModel[] = [
  // ─── Qwen3.5 (2026년 최신 — Alibaba + 커뮤니티 증류) ───
  { category: "general",   repo_id: "mlx-community/Qwen3.5-4B-MLX-4bit",                              revision: "main", label: "Qwen3.5 4B",                  description: "최신 Alibaba — 2.5GB, 빠름",                      size_gb: 2.5, min_ram_gb: 6  },
  { category: "general",   repo_id: "mlx-community/Qwen3.5-9B-MLX-4bit",                              revision: "main", label: "Qwen3.5 9B (VL)",             description: "최신 Alibaba VL — 5.5GB, 비전+텍스트",             size_gb: 5.5, min_ram_gb: 12, badge: "★ 최신", capabilities: { vision: true } },
  { category: "reasoning", repo_id: "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit",      revision: "main", label: "Qwen3.5 27B (Opus 증류)",       description: "Claude 4.6 Opus 추론 증류 — 15GB",                 size_gb: 15,  min_ram_gb: 20, badge: "🧠 추천", capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-8bit",      revision: "main", label: "Qwen3.5 27B 8bit (Opus 증류)",  description: "Opus 증류 고품질 8bit — 27GB",                      size_gb: 27,  min_ram_gb: 36, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/Qwen3.5-30B-A3B-Claude-4.6-Opus-Distilled-MLX-4bit",  revision: "main", label: "Qwen3.5 30B-A3B (Opus 증류)",   description: "MoE 30B 활성 3B — Opus 증류 — 17GB, 빠름",          size_gb: 17,  min_ram_gb: 24, badge: "🚀 MoE", capabilities: { reasoning: true } },
  { category: "coding",    repo_id: "mlx-community/Qwen3.5-Coder-30B-A3B-Claude-4.6-Opus-Distilled-MLX-4bit", revision: "main", label: "Qwen3.5-Coder 30B-A3B (Opus 증류)", description: "코딩 특화 + Opus 증류 — 17GB",                  size_gb: 17,  min_ram_gb: 24, badge: "⚡ 코딩+추론", capabilities: { reasoning: true } },

  // ─── Qwen3 (2025 릴리즈) ───
  { category: "lightweight", repo_id: "mlx-community/Qwen3-0.6B-4bit",                               revision: "main", label: "Qwen3 0.6B",                  description: "초경량 — 0.4GB, 즉각 응답",                        size_gb: 0.4, min_ram_gb: 2  },
  { category: "lightweight", repo_id: "mlx-community/Qwen3-1.7B-4bit",                               revision: "main", label: "Qwen3 1.7B",                  description: "경량 — 1GB, 빠른 응답",                            size_gb: 1,   min_ram_gb: 3  },
  { category: "general",   repo_id: "mlx-community/Qwen3-4B-4bit",                                   revision: "main", label: "Qwen3 4B",                    description: "범용 경량 — 2.5GB",                                size_gb: 2.5, min_ram_gb: 6  },
  { category: "general",   repo_id: "mlx-community/Qwen3-8B-4bit",                                   revision: "main", label: "Qwen3 8B",                    description: "범용 기본 — 5GB",                                   size_gb: 5,   min_ram_gb: 10 },
  { category: "general",   repo_id: "mlx-community/Qwen3-14B-4bit",                                  revision: "main", label: "Qwen3 14B",                   description: "범용 고품질 — 8.5GB",                               size_gb: 8.5, min_ram_gb: 16 },
  { category: "general",   repo_id: "mlx-community/Qwen3-32B-4bit",                                  revision: "main", label: "Qwen3 32B",                   description: "범용 최강 — 19GB",                                  size_gb: 19,  min_ram_gb: 24 },
  { category: "general",   repo_id: "mlx-community/Qwen3-30B-A3B-4bit",                              revision: "main", label: "Qwen3-30B MoE (A3B)",         description: "MoE 30B 활성 3B — 18GB, 빠른 추론",                size_gb: 18,  min_ram_gb: 24 },
  { category: "coding",    repo_id: "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit",               revision: "main", label: "Qwen3-Coder 30B (MoE)",       description: "최신 코딩 MoE — 18GB, 활성 3B",                     size_gb: 18,  min_ram_gb: 24, badge: "★ 추천" },

  // ─── Qwen2.5 (레거시 하위 호환) ───
  { category: "coding",  repo_id: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",  revision: "main", label: "Qwen2.5-Coder 7B",  description: "코딩 안정판 — 4.5GB",                  size_gb: 4.5, min_ram_gb: 8  },
  { category: "coding",  repo_id: "mlx-community/Qwen2.5-Coder-14B-Instruct-4bit", revision: "main", label: "Qwen2.5-Coder 14B", description: "코딩 안정판 — 8.5GB",                  size_gb: 8.5, min_ram_gb: 16 },
  { category: "coding",  repo_id: "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit", revision: "main", label: "Qwen2.5-Coder 32B", description: "코딩 안정판 — 19GB",                   size_gb: 19,  min_ram_gb: 24 },
  { category: "general", repo_id: "mlx-community/Qwen2.5-7B-Instruct-4bit",        revision: "main", label: "Qwen2.5 7B",         description: "레거시 — 4.5GB",                      size_gb: 4.5, min_ram_gb: 8  },
  { category: "general", repo_id: "mlx-community/Qwen2.5-14B-Instruct-4bit",       revision: "main", label: "Qwen2.5 14B",        description: "레거시 — 8.5GB",                      size_gb: 8.5, min_ram_gb: 16 },
  { category: "general", repo_id: "mlx-community/Qwen2.5-32B-Instruct-4bit",       revision: "main", label: "Qwen2.5 32B",        description: "레거시 — 19GB",                       size_gb: 19,  min_ram_gb: 24 },
  { category: "general", repo_id: "mlx-community/Qwen2.5-72B-Instruct-4bit",       revision: "main", label: "Qwen2.5 72B",        description: "레거시 — 38GB, Ultra 전용",           size_gb: 38,  min_ram_gb: 48 },

  // 범용 — Llama
  { category: "general", repo_id: "mlx-community/Llama-3.2-3B-Instruct-4bit",      revision: "main", label: "Llama 3.2 3B",       description: "초경량, 즉각 응답 — 2GB",            size_gb: 2,   min_ram_gb: 4  },
  { category: "general", repo_id: "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit", revision: "main", label: "Llama 3.1 8B",       description: "범용 균형 — 5GB",                    size_gb: 5,   min_ram_gb: 8  },
  { category: "general", repo_id: "mlx-community/Llama-3.3-70B-Instruct-4bit",     revision: "main", label: "Llama 3.3 70B",      description: "범용 최강 — 38GB, Ultra 전용",       size_gb: 38,  min_ram_gb: 48 },

  // 범용 — Gemma 4 (Google, 2026 최신) ★
  { category: "lightweight", repo_id: "mlx-community/gemma-4-e2b-it-4bit",          revision: "main", label: "Gemma 4 E2B",        description: "Google Edge — 1.5GB, 모바일급 경량",  size_gb: 1.5, min_ram_gb: 4  },
  { category: "general",   repo_id: "mlx-community/gemma-4-e4b-it-4bit",            revision: "main", label: "Gemma 4 E4B",        description: "Google Edge — 2.5GB, 빠른 응답",       size_gb: 2.5, min_ram_gb: 6  },
  { category: "general",   repo_id: "mlx-community/gemma-4-26b-a4b-it-4bit",        revision: "main", label: "Gemma 4 26B (MoE A4B)", description: "Google MoE — 15GB, 활성 4B로 빠름",  size_gb: 15,  min_ram_gb: 20, badge: "★ 최신" },
  { category: "general",   repo_id: "mlx-community/gemma-4-31b-it-4bit",            revision: "main", label: "Gemma 4 31B",        description: "Google 최신 — 18GB, 최고 품질",       size_gb: 18,  min_ram_gb: 24 },

  // 범용 — Gemma 3 (Google, 레거시)
  { category: "general", repo_id: "mlx-community/gemma-3-4b-it-4bit",              revision: "main", label: "Gemma 3 4B",         description: "Google 레거시 — 2.5GB",              size_gb: 2.5, min_ram_gb: 6  },
  { category: "general", repo_id: "mlx-community/gemma-3-12b-it-4bit",             revision: "main", label: "Gemma 3 12B",        description: "Google 레거시 — 7GB",                 size_gb: 7,   min_ram_gb: 12 },
  { category: "general", repo_id: "mlx-community/gemma-3-27b-it-4bit",             revision: "main", label: "Gemma 3 27B",        description: "Google 레거시 — 15GB",                size_gb: 15,  min_ram_gb: 20 },

  // 범용 — LG EXAONE (한국어 최적화)
  { category: "lightweight", repo_id: "mlx-community/exaone-4.0-1.2b-4bit",             revision: "main", label: "EXAONE 4.0 1.2B",     description: "LG 한국어 최신 — 0.8GB, 모바일급",   size_gb: 0.8, min_ram_gb: 2  },
  { category: "general",   repo_id: "mlx-community/EXAONE-4.0-32B-4bit",                revision: "main", label: "EXAONE 4.0 32B",      description: "LG 한국어 최신 — 19GB, 한국어 SOTA", size_gb: 19,  min_ram_gb: 24, badge: "🇰🇷 한국어" },
  { category: "general",   repo_id: "mlx-community/EXAONE-3.5-2.4B-Instruct-4bit",      revision: "main", label: "EXAONE 3.5 2.4B",     description: "LG 한국어 경량 — 1.5GB",              size_gb: 1.5, min_ram_gb: 4  },
  { category: "general",   repo_id: "mlx-community/EXAONE-3.5-7.8B-Instruct-4bit",      revision: "main", label: "EXAONE 3.5 7.8B",     description: "LG 한국어 균형 — 4.5GB",              size_gb: 4.5, min_ram_gb: 8  },
  { category: "general",   repo_id: "mlx-community/EXAONE-3.5-32B-Instruct-4bit",       revision: "main", label: "EXAONE 3.5 32B",      description: "LG 한국어 대형 — 19GB",               size_gb: 19,  min_ram_gb: 24 },
  { category: "reasoning", repo_id: "mlx-community/EXAONE-Deep-2.4B-4bit",              revision: "main", label: "EXAONE Deep 2.4B",    description: "LG 추론 특화 경량 — 1.5GB",           size_gb: 1.5, min_ram_gb: 4,  capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/EXAONE-Deep-7.8B-4bit",              revision: "main", label: "EXAONE Deep 7.8B",    description: "LG 추론 특화 — 4.5GB",                size_gb: 4.5, min_ram_gb: 8,  capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/EXAONE-Deep-32B-4bit",               revision: "main", label: "EXAONE Deep 32B",     description: "LG 추론 특화 대형 — 19GB",            size_gb: 19,  min_ram_gb: 24, capabilities: { reasoning: true } },

  // 범용 — Mistral
  { category: "general", repo_id: "mlx-community/Mistral-7B-Instruct-v0.3-4bit",   revision: "main", label: "Mistral 7B",         description: "유럽 오픈소스 — 4.5GB",              size_gb: 4.5, min_ram_gb: 8  },

  // 추론 특화 — DeepSeek R1 (Qwen 기반 distill)
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit",  revision: "main", label: "DeepSeek R1 7B",   description: "추론·수학·코딩 — 4.5GB",             size_gb: 4.5, min_ram_gb: 8,  capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit", revision: "main", label: "DeepSeek R1 14B",  description: "추론 고품질 — 8.5GB",                 size_gb: 8.5, min_ram_gb: 16, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit", revision: "main", label: "DeepSeek R1 32B",  description: "추론 최강 — 19GB",                    size_gb: 19,  min_ram_gb: 24, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Llama-70B-4bit",revision: "main", label: "DeepSeek R1 70B (Llama)", description: "추론 최대 — 40GB, M3/M4 Max+",  size_gb: 40,  min_ram_gb: 48, capabilities: { reasoning: true } },

  // DeepSeek Coder V2 (MoE 16B active 2.4B — 빠른 추론)
  { category: "coding",  repo_id: "mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit-mlx", revision: "main", label: "DeepSeek-Coder V2 Lite (MoE)", description: "MoE 16B 활성 2.4B — 10GB, 코딩 고속", size_gb: 10,  min_ram_gb: 16, badge: "⚡ MoE" },

  // DeepSeek Coder (원조 — 전통 dense)
  { category: "lightweight", repo_id: "mlx-community/deepseek-coder-1.3b-instruct-mlx",          revision: "main", label: "DeepSeek-Coder 1.3B", description: "초경량 코딩 — 0.8GB, 자동완성 급",    size_gb: 0.8, min_ram_gb: 2  },
  { category: "coding",      repo_id: "mlx-community/deepseek-coder-6.7b-instruct-hf-4bit-mlx",  revision: "main", label: "DeepSeek-Coder 6.7B", description: "코딩 기본 dense — 4GB",                size_gb: 4,   min_ram_gb: 8  },
  { category: "coding",      repo_id: "mlx-community/deepseek-coder-33b-instruct-hf-4bit-mlx",   revision: "main", label: "DeepSeek-Coder 33B", description: "코딩 대형 dense — 18GB",               size_gb: 18,  min_ram_gb: 24 },

  // 경량 특화
  { category: "lightweight", repo_id: "mlx-community/phi-4-4bit",                  revision: "main", label: "Phi-4 14B",          description: "Microsoft — 8GB, 매우 효율적",       size_gb: 8,   min_ram_gb: 12 },
  { category: "lightweight", repo_id: "mlx-community/Llama-3.2-1B-Instruct-4bit",  revision: "main", label: "Llama 3.2 1B",       description: "최소 사양 — 0.7GB, 즉각 응답",       size_gb: 0.7, min_ram_gb: 2  },
];

// ── NVIDIA (EXL2 / TabbyAPI) ──────────────────────────────────────
// min_ram_gb = 필요 VRAM(GB). bartowski/lucyknada/DrNicefellow HF EXL2 레포.
// 🥇 상단 3종 = RTX 3080(10GB) 최우선 추천
const CURATED_MODELS: CuratedModel[] = [

  // ── 🥇 10GB VRAM 추천 3종 ────────────────────────────────────────
  {
    category: "reasoning",
    repo_id: "bartowski/Qwen3-8B-Instruct-exl2",
    revision: "4_5",
    label: "Qwen3 8B (4.5bpw)",
    description: "🥇 2025 최신 추론 SOTA — 사고 체인(CoT) · ~5.5GB VRAM",
    size_gb: 5.5, min_ram_gb: 8, badge: "🧠 최신 추천",
    capabilities: { reasoning: true },
  },
  {
    category: "coding",
    repo_id: "bartowski/Qwen3-8B-Instruct-exl2",
    revision: "6_0",
    label: "Qwen3 8B (6bpw)",
    description: "🥇 코딩·지시 추종 — 고품질 · ~7GB VRAM",
    size_gb: 7.0, min_ram_gb: 8, badge: "⚡ 코딩 SOTA",
    capabilities: { reasoning: true },
  },
  {
    category: "coding",
    repo_id: "bartowski/Qwen2.5-Coder-14B-Instruct-exl2",
    revision: "4_25",
    label: "Qwen2.5-Coder 14B (4.25bpw)",
    description: "🥇 한계 돌파 — 14B 프로젝트 맥락 · ~9GB VRAM",
    size_gb: 9.0, min_ram_gb: 10, badge: "🚀 한계 돌파",
  },

  // ── Qwen3 (2025 최신) ────────────────────────────────────────────
  { category: "lightweight", repo_id: "bartowski/Qwen3-4B-Instruct-exl2",  revision: "4_5",  label: "Qwen3 4B (4.5bpw)",  description: "경량 최신 · ~2.5GB VRAM",                size_gb: 2.5,  min_ram_gb: 4,  capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-4B-Instruct-exl2",  revision: "8_0",  label: "Qwen3 4B (8bpw)",    description: "경량 고품질 · ~4GB VRAM",                size_gb: 4.0,  min_ram_gb: 6,  capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-8B-Instruct-exl2",  revision: "3_5",  label: "Qwen3 8B (3.5bpw)",  description: "범용 경량 · ~4GB VRAM",                  size_gb: 4.0,  min_ram_gb: 6,  capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-8B-Instruct-exl2",  revision: "8_0",  label: "Qwen3 8B (8bpw)",    description: "범용 고품질 · ~9.5GB VRAM",              size_gb: 9.5,  min_ram_gb: 12, capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-14B-Instruct-exl2", revision: "4_0",  label: "Qwen3 14B (4bpw)",   description: "범용 고급 · ~8GB VRAM",                  size_gb: 8.0,  min_ram_gb: 10, capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-14B-Instruct-exl2", revision: "6_0",  label: "Qwen3 14B (6bpw)",   description: "범용 고품질 · ~12GB VRAM",               size_gb: 12.0, min_ram_gb: 14, capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-32B-Instruct-exl2", revision: "3_5",  label: "Qwen3 32B (3.5bpw)", description: "최강 범용 경량 · ~16GB VRAM",            size_gb: 16.0, min_ram_gb: 20, capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-32B-Instruct-exl2", revision: "5_0",  label: "Qwen3 32B (5bpw)",   description: "최강 범용 · ~22GB VRAM",                 size_gb: 22.0, min_ram_gb: 24, capabilities: { reasoning: true } },
  { category: "general",     repo_id: "bartowski/Qwen3-30B-A3B-Instruct-exl2", revision: "4_0", label: "Qwen3 30B MoE (A3B·4bpw)", description: "MoE 30B 활성 3B — 빠른 추론 · ~16GB", size_gb: 16.0, min_ram_gb: 20, capabilities: { reasoning: true } },

  // ── Qwen3.5 Claude 4.6 Opus 증류 (2026 추론 특화) ────────────────
  { category: "reasoning", repo_id: "bartowski/Qwen3.5-27B-Claude-4.6-Opus-Distilled-exl2",      revision: "4_0", label: "Qwen3.5 27B Opus 증류 (4bpw)",      description: "🧠 Claude Opus 추론 증류 · ~14GB VRAM",        size_gb: 14.0, min_ram_gb: 18, badge: "🧠 추천", capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/Qwen3.5-27B-Claude-4.6-Opus-Distilled-exl2",      revision: "5_0", label: "Qwen3.5 27B Opus 증류 (5bpw)",      description: "Opus 증류 균형 · ~17GB VRAM",                   size_gb: 17.0, min_ram_gb: 20, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/Qwen3.5-27B-Claude-4.6-Opus-Distilled-exl2",      revision: "6_0", label: "Qwen3.5 27B Opus 증류 (6bpw)",      description: "Opus 증류 고품질 · ~21GB VRAM",                  size_gb: 21.0, min_ram_gb: 24, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/Qwen3.5-30B-A3B-Claude-4.6-Opus-Distilled-exl2",  revision: "4_0", label: "Qwen3.5 30B-A3B Opus 증류 (4bpw)",  description: "🚀 MoE 30B 활성 3B + Opus 증류 · ~16GB",        size_gb: 16.0, min_ram_gb: 20, badge: "🚀 MoE", capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/Qwen3.5-30B-A3B-Claude-4.6-Opus-Distilled-exl2",  revision: "5_0", label: "Qwen3.5 30B-A3B Opus 증류 (5bpw)",  description: "MoE Opus 증류 고품질 · ~19GB",                  size_gb: 19.0, min_ram_gb: 24, capabilities: { reasoning: true } },
  { category: "coding",    repo_id: "bartowski/Qwen3.5-Coder-30B-A3B-Claude-4.6-Opus-Distilled-exl2", revision: "4_0", label: "Qwen3.5-Coder 30B-A3B Opus 증류 (4bpw)", description: "⚡ 코딩 + Opus 추론 증류 MoE · ~16GB",        size_gb: 16.0, min_ram_gb: 20, badge: "⚡ 코딩+추론", capabilities: { reasoning: true } },

  // ── Gemma 3 (Google · bartowski) ─────────────────────────────────
  { category: "lightweight", repo_id: "bartowski/gemma-3-4b-it-exl2",  revision: "4_0", label: "Gemma 3 4B (4bpw)",   description: "Google 경량 최신 · ~2.5GB VRAM",   size_gb: 2.5, min_ram_gb: 4  },
  { category: "lightweight", repo_id: "bartowski/gemma-3-4b-it-exl2",  revision: "8_0", label: "Gemma 3 4B (8bpw)",   description: "Google 경량 고품질 · ~4GB VRAM",   size_gb: 4.0, min_ram_gb: 6  },
  { category: "general",     repo_id: "bartowski/gemma-3-12b-it-exl2", revision: "4_0", label: "Gemma 3 12B (4bpw)",  description: "Google 균형 · ~7GB VRAM",          size_gb: 7.0, min_ram_gb: 10 },
  { category: "general",     repo_id: "bartowski/gemma-3-12b-it-exl2", revision: "6_0", label: "Gemma 3 12B (6bpw)",  description: "Google 균형 고품질 · ~10GB VRAM",  size_gb: 10.0, min_ram_gb: 12 },
  { category: "general",     repo_id: "bartowski/gemma-3-27b-it-exl2", revision: "4_0", label: "Gemma 3 27B (4bpw)",  description: "Google 고급 · ~15GB VRAM",         size_gb: 15.0, min_ram_gb: 18 },
  { category: "general",     repo_id: "bartowski/gemma-3-27b-it-exl2", revision: "5_0", label: "Gemma 3 27B (5bpw)",  description: "Google 고급 고품질 · ~18GB VRAM",  size_gb: 18.0, min_ram_gb: 24 },

  // ── DeepSeek R1 Distill (추론 특화) ──────────────────────────────
  { category: "reasoning", repo_id: "bartowski/DeepSeek-R1-Distill-Qwen-7B-exl2",  revision: "4_0",  label: "DeepSeek R1 7B (4bpw)",  description: "추론·수학·코딩 · ~4.5GB VRAM",   size_gb: 4.5,  min_ram_gb: 6,  capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/DeepSeek-R1-Distill-Qwen-7B-exl2",  revision: "6_0",  label: "DeepSeek R1 7B (6bpw)",  description: "추론 고품질 · ~6.5GB VRAM",       size_gb: 6.5,  min_ram_gb: 8,  badge: "🧠 추론 최강", capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/DeepSeek-R1-Distill-Qwen-14B-exl2", revision: "4_0",  label: "DeepSeek R1 14B (4bpw)", description: "추론 중급 · ~8GB VRAM",           size_gb: 8.0,  min_ram_gb: 10, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/DeepSeek-R1-Distill-Qwen-32B-exl2", revision: "3_5",  label: "DeepSeek R1 32B (3.5bpw)", description: "추론 최강 경량 · ~16GB VRAM",   size_gb: 16.0, min_ram_gb: 20, capabilities: { reasoning: true } },
  { category: "reasoning", repo_id: "bartowski/DeepSeek-R1-Distill-Qwen-32B-exl2", revision: "5_0",  label: "DeepSeek R1 32B (5bpw)", description: "추론 최강 · ~22GB VRAM",          size_gb: 22.0, min_ram_gb: 24, capabilities: { reasoning: true } },

  // ── DeepSeek V3 (대형 MoE — 24GB+ 전용) ─────────────────────────
  { category: "reasoning", repo_id: "bartowski/DeepSeek-V3-0324-exl2",              revision: "2_0",  label: "DeepSeek V3 0324 (2bpw)", description: "V3 최신판 초경량 · ~44GB, 멀티GPU", size_gb: 44.0, min_ram_gb: 48, capabilities: { reasoning: true } },

  // ── Qwen2.5-Coder (코딩 안정판) ──────────────────────────────────
  { category: "coding", repo_id: "DrNicefellow/Qwen2.5-Coder-7B-Instruct-4.0bpw-exl2",     revision: "main", label: "Qwen2.5-Coder 7B (4bpw)",    description: "코딩 안정판 경량 · ~4.5GB", size_gb: 4.5,  min_ram_gb: 6  },
  { category: "coding", repo_id: "DrNicefellow/Qwen2.5-Coder-7B-Instruct-5.5bpw-exl2",     revision: "main", label: "Qwen2.5-Coder 7B (5.5bpw)",  description: "코딩 안정판 균형 · ~6GB",   size_gb: 6.0,  min_ram_gb: 8  },
  { category: "coding", repo_id: "bartowski/Qwen2.5-Coder-14B-Instruct-exl2",               revision: "5_0",  label: "Qwen2.5-Coder 14B (5bpw)",   description: "코딩 고품질 · ~10.5GB",     size_gb: 10.5, min_ram_gb: 12 },
  { category: "coding", repo_id: "bartowski/Qwen2.5-Coder-32B-Instruct-exl2",               revision: "4_25", label: "Qwen2.5-Coder 32B (4.25bpw)", description: "최강 코딩 · ~18GB",        size_gb: 18.0, min_ram_gb: 24 },

  // ── Llama 3.x ─────────────────────────────────────────────────────
  { category: "general", repo_id: "bartowski/Meta-Llama-3.1-8B-Instruct-exl2",              revision: "4_0",  label: "Llama 3.1 8B (4bpw)",  description: "범용 경량 · ~5GB VRAM",     size_gb: 5.0,  min_ram_gb: 6  },
  { category: "general", repo_id: "bartowski/Meta-Llama-3.1-8B-Instruct-exl2",              revision: "6_0",  label: "Llama 3.1 8B (6bpw)",  description: "범용 균형 · ~7GB VRAM",     size_gb: 7.0,  min_ram_gb: 8  },
  { category: "general", repo_id: "bartowski/Llama-3.3-70B-Instruct-exl2",                  revision: "3_0",  label: "Llama 3.3 70B (3bpw)", description: "범용 최강 · ~29GB VRAM",    size_gb: 29.0, min_ram_gb: 32 },

  // ── LG EXAONE (한국어 최적화 · bartowski EXL2) ───────────────────
  { category: "general",     repo_id: "bartowski/EXAONE-3.5-2.4B-Instruct-exl2",  revision: "4_0", label: "EXAONE 3.5 2.4B (4bpw)", description: "LG 한국어 경량 · ~1.5GB VRAM",         size_gb: 1.5,  min_ram_gb: 3,  badge: "🇰🇷 한국어" },
  { category: "general",     repo_id: "bartowski/EXAONE-3.5-2.4B-Instruct-exl2",  revision: "8_0", label: "EXAONE 3.5 2.4B (8bpw)", description: "LG 한국어 경량 고품질 · ~2.5GB VRAM",   size_gb: 2.5,  min_ram_gb: 4,  badge: "🇰🇷 한국어" },
  { category: "general",     repo_id: "bartowski/EXAONE-3.5-7.8B-Instruct-exl2",  revision: "4_0", label: "EXAONE 3.5 7.8B (4bpw)", description: "LG 한국어 균형 · ~5GB VRAM",           size_gb: 5.0,  min_ram_gb: 6,  badge: "🇰🇷 한국어" },
  { category: "general",     repo_id: "bartowski/EXAONE-3.5-7.8B-Instruct-exl2",  revision: "6_0", label: "EXAONE 3.5 7.8B (6bpw)", description: "LG 한국어 균형 고품질 · ~7GB VRAM",     size_gb: 7.0,  min_ram_gb: 8,  badge: "🇰🇷 한국어" },
  { category: "general",     repo_id: "bartowski/EXAONE-3.5-32B-Instruct-exl2",   revision: "3_5", label: "EXAONE 3.5 32B (3.5bpw)", description: "LG 한국어 대형 · ~16GB VRAM",          size_gb: 16.0, min_ram_gb: 20, badge: "🇰🇷 한국어" },
  { category: "general",     repo_id: "bartowski/EXAONE-3.5-32B-Instruct-exl2",   revision: "5_0", label: "EXAONE 3.5 32B (5bpw)",   description: "LG 한국어 대형 고품질 · ~22GB VRAM",   size_gb: 22.0, min_ram_gb: 24, badge: "🇰🇷 한국어" },
  { category: "reasoning",   repo_id: "bartowski/EXAONE-Deep-2.4B-exl2",           revision: "4_0", label: "EXAONE Deep 2.4B (4bpw)", description: "LG 추론 특화 경량 · ~1.5GB VRAM",      size_gb: 1.5,  min_ram_gb: 3,  capabilities: { reasoning: true }, badge: "🇰🇷 한국어" },
  { category: "reasoning",   repo_id: "bartowski/EXAONE-Deep-7.8B-exl2",           revision: "4_0", label: "EXAONE Deep 7.8B (4bpw)", description: "LG 추론 특화 · ~5GB VRAM",             size_gb: 5.0,  min_ram_gb: 6,  capabilities: { reasoning: true }, badge: "🇰🇷 한국어" },
  { category: "reasoning",   repo_id: "bartowski/EXAONE-Deep-7.8B-exl2",           revision: "6_0", label: "EXAONE Deep 7.8B (6bpw)", description: "LG 추론 특화 고품질 · ~7GB VRAM",      size_gb: 7.0,  min_ram_gb: 8,  capabilities: { reasoning: true }, badge: "🇰🇷 한국어" },
  { category: "reasoning",   repo_id: "bartowski/EXAONE-Deep-32B-exl2",            revision: "3_5", label: "EXAONE Deep 32B (3.5bpw)", description: "LG 추론 특화 대형 · ~16GB VRAM",      size_gb: 16.0, min_ram_gb: 20, capabilities: { reasoning: true }, badge: "🇰🇷 한국어" },

  // ── 초경량 ────────────────────────────────────────────────────────
  { category: "lightweight", repo_id: "bartowski/Qwen3-1.7B-Instruct-exl2",                 revision: "8_0",  label: "Qwen3 1.7B (8bpw)",    description: "초경량 최신 · ~1.7GB VRAM", size_gb: 1.7,  min_ram_gb: 3, capabilities: { reasoning: true } },
  { category: "lightweight", repo_id: "lucyknada/Qwen_Qwen2.5-Coder-3B-Instruct-exl2",      revision: "6.0bpw", label: "Qwen2.5-Coder 3B (6bpw)", description: "코딩 초경량 · ~3GB VRAM", size_gb: 3.0, min_ram_gb: 4  },
];

interface Props {
  onClose: () => void;
  recommendedModel?: string;
  gpuVramGb?: number;        // Windows 외장 GPU VRAM
  totalMemoryGb?: number;    // Mac 통합 메모리 또는 시스템 RAM
}

const ModelManager: React.FC<Props> = ({ onClose, recommendedModel: _recommendedModel, gpuVramGb, totalMemoryGb }) => {
  const [tab, setTab] = useState<"installed" | "download">("installed");
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [downloading, setDownloading] = useState<Record<string, DownloadProgress>>({});
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [hfToken, setHfToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenHighlight, setTokenHighlight] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);
  const [customRepo, setCustomRepo] = useState("");
  const [customRevision, setCustomRevision] = useState("");
  const [isAppleSilicon, setIsAppleSilicon] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ percent: number; done: boolean; error?: string } | null>(null);
  const [codingModel, setCodingModel] = useState<string | null>(null);
  const [docModel, setDocModel] = useState<string | null>(null);
  const [mistralModel, setMistralModel] = useState<string | null>(null);

  const refreshRoles = useCallback(() => {
    invoke<{ coding_model?: string; doc_model?: string; mistral_rs_model?: string }>("load_app_config")
      .then((c) => {
        setCodingModel(c.coding_model ?? null);
        setDocModel(c.doc_model ?? null);
        setMistralModel(c.mistral_rs_model ?? null);
      })
      .catch(() => {});
  }, []);

  const assignRole = useCallback(async (role: "coding" | "doc" | "heavy", modelId: string) => {
    try {
      // 전체 설정 로드 후 해당 역할만 변경 (다른 xLLM 설정 유지)
      const cfg = await invoke<Record<string, unknown>>("load_app_config");
      const patch: Record<string, unknown> =
        role === "coding" ? { coding_model: modelId } :
        role === "doc"    ? { doc_model: modelId } :
                            { mistral_rs_model: modelId, mistral_rs_enabled: true };
      const merged: Record<string, unknown> = { ...cfg, ...patch };
      await invoke("save_xllm_settings", {
        serverUrl: merged["xllm_base_url"] ?? null,
        cacheMode: merged["cache_mode"] ?? null,
        codingModel: merged["coding_model"] ?? null,
        docModel: merged["doc_model"] ?? null,
        pdThresholdChars: merged["pd_threshold_chars"] ?? null,
        maxSeqLen: merged["max_seq_len"] ?? null,
        draftModel: merged["draft_model"] ?? null,
        speculativeNDraft: merged["speculative_n_draft"] ?? null,
        sparseAttention: merged["sparse_attention"] ?? null,
        sparseTopK: merged["sparse_top_k"] ?? null,
        mistralRsEnabled: merged["mistral_rs_enabled"] ?? null,
        mistralRsUrl: merged["mistral_rs_url"] ?? null,
        mistralRsModel: merged["mistral_rs_model"] ?? null,
      });
      if (role === "coding") setCodingModel(modelId);
      else if (role === "doc") setDocModel(modelId);
      else setMistralModel(modelId);
      const roleLabel = role === "coding" ? "코딩" : role === "doc" ? "문서" : "Heavy Track (mistral.rs)";
      setLoadMsg(`✅ ${modelId} → ${roleLabel}`);
    } catch (e) {
      const raw = e as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw));
      setLoadMsg(`❌ 역할 지정 실패: ${msg}`);
    }
  }, []);

  const fetchLoaded = useCallback(() => {
    invoke<{ id: string }>("get_xllm_model_info")
      .then((info) => setLoadedModelId(info?.id && info.id !== "unknown" ? info.id : null))
      .catch(() => setLoadedModelId(null));
  }, []);

  // MLX-LM 시작 진행률 이벤트 수신
  useEffect(() => {
    const unlisten = listen<{ percent: number; done: boolean; error?: string }>(
      "mlx_download_progress",
      (e) => {
        setLoadProgress(e.payload);
        if (e.payload.done) {
          fetchLoaded();
          setTimeout(() => setLoadProgress(null), e.payload.error ? 8000 : 3000);
        }
      },
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchLoaded]);

  const useModel = useCallback(async (modelId: string, modelPath?: string) => {
    setLoadingModel(modelId);
    setLoadMsg(null);
    setLoadProgress({ percent: 0, done: false });
    try {
      if (isAppleSilicon) {
        // MLX-LM은 동적 모델 전환 미지원 — 로컬 경로로 서버 재시작
        // port:0 → 백엔드에서 실행 중인 포트 자동 감지 (하드코딩 5000 제거)
        const target = modelPath ?? modelId.replace("--", "/");
        await invoke("restart_with_model", { port: 0, model: target });
        // 진행률은 아래 progress 이벤트 리스너가 관리
      } else {
        const msg = await invoke<string>("switch_xllm_model", { modelName: modelId, cacheMode: null, maxSeqLen: null });
        setLoadMsg(`✅ ${msg}`);
        setLoadProgress(null);
      }
      fetchLoaded();
    } catch (e) {
      const raw = e as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw));
      setLoadMsg(`❌ ${msg}`);
      setLoadProgress(null);
    } finally {
      setLoadingModel(null);
    }
  }, [isAppleSilicon, fetchLoaded]);

  const loadLocalModels = useCallback(async () => {
    try {
      const models = await invoke<LocalModel[]>("list_local_models");
      setLocalModels(models);
    } catch {
      // 모델 디렉토리 없을 경우 빈 목록
    }
  }, []);

  const saveToken = useCallback(async (t: string) => {
    try {
      await invoke("save_hf_token", { token: t });
    } catch {
      // 저장 실패 시 무시
    }
  }, []);

  useEffect(() => {
    invoke<string>("get_platform_arch").then((a) => setIsAppleSilicon(a === "aarch64")).catch(() => {});
    // 저장된 HF 토큰 불러오기
    invoke<{ hf_token?: string }>("load_app_config")
      .then((c) => { if (c.hf_token) setHfToken(c.hf_token); })
      .catch(() => {});
    loadLocalModels();
    fetchLoaded();
    refreshRoles();

    const unlisten = listen<DownloadProgress>("model_download_progress", (event) => {
      const p = event.payload;
      setStarting(prev => { const s = new Set(prev); s.delete(p.repo_id); return s; });
      if (p.done) {
        setDownloading((prev) => {
          const next = { ...prev };
          delete next[p.repo_id];
          return next;
        });
        loadLocalModels();
      } else {
        setDownloading((prev) => {
          const existing = prev[p.repo_id];
          const seen = existing?._seenFiles ?? [];
          const isNewFile = !seen.includes(p.file);
          // 파일이 바뀌었으면 이전 파일의 total을 누적 바이트에 더함
          const addedBytes = isNewFile && existing && existing.file && existing.file !== p.file
            ? existing.total
            : 0;
          const seenFiles = isNewFile ? [...seen, p.file] : seen;
          return {
            ...prev,
            [p.repo_id]: {
              ...p,
              _filesCompleted: Math.max(0, seenFiles.length - 1),
              _totalDownloaded: (existing?._totalDownloaded ?? 0) + addedBytes,
              _seenFiles: seenFiles,
            },
          };
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadLocalModels]);

  const startDownload = async (repoId: string, revision: string | null) => {
    if (downloading[repoId] || starting.has(repoId)) return;
    setDownloadError(null);
    setStarting(prev => new Set(prev).add(repoId));
    try {
      await invoke("download_model", { repoId, revision, hfToken: hfToken || null });
    } catch (err) {
      const raw = err as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw) ?? "알 수 없는 오류");
      setDownloadError(msg);
      setTab("download");
      if (msg.includes("인증") || msg.includes("401") || msg.includes("403")) {
        setShowToken(true);
        setTokenHighlight(true);
        setTimeout(() => {
          tokenRef.current?.focus();
          setTokenHighlight(false);
        }, 300);
      }
    } finally {
      setStarting(prev => { const s = new Set(prev); s.delete(repoId); return s; });
    }
  };

  const handleDownload = (model: CuratedModel) => startDownload(model.repo_id, model.revision);

  const handleCustomDownload = () => {
    const repo = customRepo.trim();
    if (!repo) return;
    startDownload(repo, customRevision.trim() || null);
  };

  const handleCancelDownload = async (repoId: string) => {
    try {
      await invoke("cancel_download", { repoId });
    } catch {}
  };

  const handleDelete = async (modelId: string) => {
    setDeleting(modelId);
    try {
      await invoke("delete_model", { modelId });
      await loadLocalModels();
    } catch (err) {
      console.error("삭제 실패:", err);
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
    }
  };

  const formatMb = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

  const progressPct = (p: DownloadProgress) =>
    p.total > 0 ? Math.round((p.downloaded / p.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0f1117] border border-white/10 rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-accent" />
            <span className="text-sm font-semibold">모델 관리</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-white/5">
          {(["installed", "download"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t ? "text-white border-b border-accent" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "installed" ? `설치된 모델 (${localModels.length})` : "다운로드"}
            </button>
          ))}
        </div>

        {/* 다운로드 에러 — 탭에 관계없이 항상 표시 */}
        {downloadError && (
          <div className="flex items-start gap-2 px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span className="flex-1 break-all">{downloadError}</span>
            <button onClick={() => setDownloadError(null)} className="shrink-0 text-red-400/60 hover:text-red-400">✕</button>
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tab === "installed" ? (
            localModels.length === 0 ? (
              <div className="text-center text-white/30 py-12 text-sm">
                설치된 모델이 없습니다.
              </div>
            ) : (
              <>
                {loadMsg && (
                  <div className="mb-2 px-3 py-2 rounded text-[11px] bg-white/5 border border-white/10">{loadMsg}</div>
                )}

                {/* MLX-LM 시작 진행률 바 */}
                {loadProgress && (
                  <div className={`mb-2 px-3 py-2 rounded border ${
                    loadProgress.error
                      ? "bg-red-500/5 border-red-500/30"
                      : loadProgress.done
                        ? "bg-green-500/5 border-green-500/30"
                        : "bg-accent/5 border-accent/30"
                  }`}>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={
                        loadProgress.error ? "text-red-400" :
                        loadProgress.done ? "text-green-400" :
                        "text-accent"
                      }>
                        {loadProgress.error
                          ? "❌ 모델 로드 실패"
                          : loadProgress.done
                            ? "✅ 모델 로드 완료"
                            : "⏳ MLX-LM 서버 시작 중"}
                      </span>
                      <span className="text-white/40 font-mono">{loadProgress.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          loadProgress.error ? "bg-red-400" :
                          loadProgress.done ? "bg-green-400" :
                          "bg-accent"
                        }`}
                        style={{ width: `${loadProgress.percent}%` }}
                      />
                    </div>
                    {loadProgress.error && (
                      <pre className="mt-2 text-[10px] text-red-300/70 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                        {loadProgress.error}
                      </pre>
                    )}
                    {!loadProgress.done && !loadProgress.error && (
                      <div className="text-[10px] text-white/30 mt-1.5">
                        27B 모델은 90초 이상 걸릴 수 있습니다
                      </div>
                    )}
                  </div>
                )}
                {localModels.map((m) => {
                  const isLoaded = loadedModelId === m.id;
                  const isEmpty = m.size_mb === 0;
                  const isBusy = loadingModel === m.id;
                  const isCoding = codingModel === m.id;
                  const isDoc = docModel === m.id;
                  const isHeavy = mistralModel === m.id || mistralModel === m.path;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-2 p-3 bg-white/5 rounded-lg border transition-colors ${
                        isLoaded ? "border-green-400/40" : "border-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="text-xs font-medium truncate">{m.id}</div>
                          {isLoaded && (
                            <span className="shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-green-400/15 text-green-300 rounded-full">
                              <CheckCircle2 size={9} /> 로드됨
                            </span>
                          )}
                          {isCoding && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-blue-400/15 text-blue-300 rounded-full">💻 코딩</span>
                          )}
                          {isDoc && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-purple-400/15 text-purple-300 rounded-full">📄 문서</span>
                          )}
                          {isHeavy && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-pink-400/15 text-pink-300 rounded-full">🚀 Heavy</span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">
                          {isEmpty ? "빈 폴더 (다운로드 미완료)" : formatMb(m.size_mb)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isEmpty && !isLoaded && (
                          <button
                            onClick={() => useModel(m.id, m.path)}
                            disabled={isBusy || !!loadingModel}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-accent text-[10px] font-medium disabled:opacity-50 transition-colors"
                          >
                            <Play size={11} />
                            {isBusy ? (isAppleSilicon ? "재시작 중…" : "로드 중…") : (isAppleSilicon ? "재시작" : "사용")}
                          </button>
                        )}
                        {deleteConfirm === m.id ? (
                          <>
                            <span className="text-[10px] text-red-400">삭제?</span>
                            <button
                              onClick={() => handleDelete(m.id)}
                              disabled={deleting === m.id}
                              className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-medium disabled:opacity-50 transition-colors"
                            >
                              {deleting === m.id ? "삭제 중..." : "확인"}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/60 text-[10px] transition-colors"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(m.id)}
                            disabled={deleting === m.id}
                            className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      </div>

                      {!isEmpty && (
                        <div className="flex items-center gap-1.5 pl-0.5">
                          <span className="text-[10px] text-white/30">역할:</span>
                          <button
                            onClick={() => assignRole("coding", m.id)}
                            disabled={isCoding}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isCoding
                                ? "bg-blue-400/20 text-blue-300 cursor-default"
                                : "bg-white/5 hover:bg-blue-400/10 text-white/50 hover:text-blue-300"
                            }`}
                          >
                            💻 코딩용으로 지정
                          </button>
                          <button
                            onClick={() => assignRole("doc", m.id)}
                            disabled={isDoc}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isDoc
                                ? "bg-purple-400/20 text-purple-300 cursor-default"
                                : "bg-white/5 hover:bg-purple-400/10 text-white/50 hover:text-purple-300"
                            }`}
                          >
                            📄 문서용으로 지정
                          </button>
                          <button
                            onClick={() => assignRole("heavy", m.path ?? m.id)}
                            disabled={isHeavy}
                            title="!! 접두사로 호출 — mistral.rs Heavy Track에 로컬 경로 지정"
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isHeavy
                                ? "bg-pink-400/20 text-pink-300 cursor-default"
                                : "bg-white/5 hover:bg-pink-400/10 text-white/50 hover:text-pink-300"
                            }`}
                          >
                            🚀 Heavy 지정 (mistral.rs)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )
          ) : (
            <>
              {/* HF 토큰 — 게이티드/비공개 모델용, 기본 숨김 */}
              <div className="mb-3">
                <button
                  onClick={() => setShowToken((v) => !v)}
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  {showToken ? "▾" : "▸"} 게이티드/비공개 모델 (HuggingFace 토큰 필요)
                </button>
                {showToken && (
                  <input
                    ref={tokenRef}
                    type="password"
                    placeholder="hf_xxxxxxxx…"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    onBlur={(e) => saveToken(e.target.value)}
                    className={`mt-1.5 w-full bg-white/5 border rounded px-3 py-1.5 text-xs outline-none transition-colors ${
                      tokenHighlight
                        ? "border-yellow-400/60 ring-1 ring-yellow-400/30"
                        : "border-white/10 focus:border-accent/50"
                    }`}
                  />
                )}
              </div>

              {/* 직접 입력 */}
              <div className="p-3 bg-white/3 rounded-lg border border-white/8 mb-1 space-y-2">
                <p className="text-[10px] text-white/40 font-medium">직접 입력 (HuggingFace 레포)</p>
                <input
                  type="text"
                  placeholder="author/model-name  예) turboderp/Qwen2.5-Coder-7B-Instruct-exl2"
                  value={customRepo}
                  onChange={(e) => setCustomRepo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomDownload()}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-accent/50 font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="revision / branch (선택, 예: 4.0bpw)"
                    value={customRevision}
                    onChange={(e) => setCustomRevision(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomDownload()}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-accent/50 font-mono"
                  />
                  {downloading[customRepo.trim()] ? (
                    <button
                      onClick={() => handleCancelDownload(customRepo.trim())}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
                      title="다운로드 취소"
                    >
                      <XCircle size={11} />
                      취소
                    </button>
                  ) : (
                    <button
                      onClick={handleCustomDownload}
                      disabled={!customRepo.trim() || starting.has(customRepo.trim())}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-xs text-accent transition-colors disabled:opacity-40"
                    >
                      <Download size={11} />
                      {starting.has(customRepo.trim()) ? "연결 중…" : "받기"}
                    </button>
                  )}
                </div>
                {downloading[customRepo.trim()] && (
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${progressPct(downloading[customRepo.trim()])}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 플랫폼 + 카테고리 필터 */}
              <div className="space-y-2 mb-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-white/30">
                    {isAppleSilicon ? "🍎 Apple Silicon (MLX)" : "⚡ NVIDIA (EXL2)"}
                    &nbsp;— 추천 목록. 더 많은 모델은 →
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAppleSilicon && (
                      <button
                        onClick={() => openUrl("https://huggingface.co/mlx-community")}
                        className="flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent transition-colors"
                        title="mlx-community HuggingFace 열기"
                      >
                        <ExternalLink size={9} />
                        mlx-community
                      </button>
                    )}
                    {!isAppleSilicon && (
                      <button
                        onClick={() => openUrl("https://huggingface.co/turboderp")}
                        className="flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent transition-colors"
                        title="turboderp HuggingFace 열기"
                      >
                        <ExternalLink size={9} />
                        turboderp (EXL2)
                      </button>
                    )}
                    <button
                      onClick={() => openUrl("https://huggingface.co/models?pipeline_tag=text-generation&sort=trending")}
                      className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                      title="HuggingFace 전체 모델 검색"
                    >
                      <ExternalLink size={9} />
                      전체 검색
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {([["all", "전체"], ...Object.entries(CATEGORY_META).map(([k, v]) => [k, `${v.icon} ${v.label}`])] as [string, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setCategoryFilter(key as ModelCategory | "all")}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        categoryFilter === key
                          ? "bg-accent/25 text-accent border border-accent/30"
                          : "bg-white/5 text-white/40 hover:text-white/70 border border-white/8"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                // Mac: 통합 메모리(totalMemoryGb) 기준, Windows: GPU VRAM 기준
                const availableGb = isAppleSilicon ? totalMemoryGb : gpuVramGb;
                const list = (isAppleSilicon ? MLX_MODELS : CURATED_MODELS)
                  .filter((m) => categoryFilter === "all" || m.category === categoryFilter);
                // 정렬 우선순위: 호환(VRAM 맞음) > 비호환, 호환 내에선 badge 있는 추천 우선.
                // 동순위 내에선 원본 배열 순서 유지(stable sort).
                const sorted = [...list].sort((a, b) => {
                  const aFits = availableGb ? a.min_ram_gb <= availableGb : true;
                  const bFits = availableGb ? b.min_ram_gb <= availableGb : true;
                  if (aFits !== bFits) return aFits ? -1 : 1;
                  const aBadge = !!a.badge;
                  const bBadge = !!b.badge;
                  if (aBadge !== bBadge) return aBadge ? -1 : 1;
                  return 0;
                });
                return sorted;
              })()
                .map((m) => {
                  const prog = downloading[m.repo_id];
                  const isStarting = starting.has(m.repo_id);
                  const availableGb = isAppleSilicon ? totalMemoryGb : gpuVramGb;
                  const isUnsupported = availableGb !== undefined && m.min_ram_gb > availableGb;
                  const memLabel = isAppleSilicon ? "RAM" : "VRAM";

                  return (
                    <div
                      key={`${m.repo_id}@${m.revision}`}
                      className={`p-3 bg-white/5 rounded-lg border transition-colors ${
                        isUnsupported ? "border-white/5 opacity-50" : m.badge ? "border-accent/25" : "border-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-white/25">{CATEGORY_META[m.category].icon}</span>
                            <span className="text-xs font-medium truncate">{m.label}</span>
                            {m.badge && !isUnsupported && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full whitespace-nowrap">
                                {m.badge}
                              </span>
                            )}
                            {m.capabilities?.vision && (
                              <span title="이미지 입력 지원 (Vision)" className="text-[9px] px-1.5 py-0.5 bg-purple-400/15 text-purple-300/80 rounded-full whitespace-nowrap">
                                👁 비전
                              </span>
                            )}
                            {m.capabilities?.reasoning && (
                              <span title="Chain-of-Thought 추론 토큰 생성" className="text-[9px] px-1.5 py-0.5 bg-cyan-400/15 text-cyan-300/80 rounded-full whitespace-nowrap">
                                🧠 추론
                              </span>
                            )}
                            {isUnsupported && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-300/80 rounded-full whitespace-nowrap">
                                {memLabel} 부족
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">{m.description}</div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                            <span className="flex items-center gap-1">
                              <HardDrive size={9} /> ~{m.size_gb} GB
                            </span>
                            <span className="flex items-center gap-1">
                              <Cpu size={9} /> {memLabel} {m.min_ram_gb}GB+
                            </span>
                          </div>
                        </div>
                        {prog ? (
                          <button
                            onClick={() => handleCancelDownload(m.repo_id)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
                            title="다운로드 취소"
                          >
                            <XCircle size={11} />
                            취소
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownload(m)}
                            disabled={isStarting}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-accent/20 text-xs transition-colors disabled:opacity-50"
                          >
                            <Download size={11} />
                            {isStarting ? "연결 중…" : "받기"}
                          </button>
                        )}
                      </div>

                      {prog && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[9px] text-white/40">
                            <span className="truncate flex-1">
                              {prog._filesCompleted !== undefined && prog._filesCompleted > 0
                                ? `파일 ${(prog._filesCompleted ?? 0) + 1}번째`
                                : "다운로드 중"}
                              {" · "}
                              <span className="text-white/30">{prog.file}</span>
                            </span>
                            <span className="font-mono shrink-0 ml-2">{progressPct(prog)}%</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent transition-all duration-300"
                              style={{ width: `${progressPct(prog)}%` }}
                            />
                          </div>
                          {prog._totalDownloaded !== undefined && prog._totalDownloaded > 0 && (
                            <div className="text-[9px] text-white/25">
                              누적 {formatMb((prog._totalDownloaded + prog.downloaded) / 1024 / 1024)} 다운로드 · 여러 파일 순차 진행 (100% → 0% 반복 정상)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelManager;
