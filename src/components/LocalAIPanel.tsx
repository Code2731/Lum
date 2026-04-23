import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Cpu, Play, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function LocalAIPanel({ onClose }: Props) {
  const [modelDir, setModelDir] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState(128);
  const [output, setOutput] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const promptRef = useRef<HTMLTextAreaElement>(null);

  async function checkStatus() {
    try {
      const s: string = await invoke("get_local_model_status");
      setStatus(s);
      setIsModelLoaded(!s.startsWith("미초기화"));
    } catch (e) {
      setStatus(null);
    }
  }

  async function handleInit() {
    if (!modelDir.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const msg: string = await invoke("init_local_model", { modelDir: modelDir.trim() });
      setStatus(msg);
      setIsModelLoaded(true);
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as { message?: string }).message ?? String(e);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setGenError(null);
    setOutput(null);
    try {
      const text: string = await invoke("generate_with_local_model", {
        prompt: prompt.trim(),
        maxNewTokens: maxTokens,
      });
      setOutput(text);
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as { message?: string }).message ?? String(e);
      setGenError(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[580px] max-h-[85vh] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-accent" />
            <span className="text-[13px] font-semibold text-white/90">로컬 AI 추론 (burn + wgpu)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* 모델 디렉토리 */}
          <section className="space-y-2">
            <p className="text-[11px] font-medium text-white/60 uppercase tracking-wide">모델 경로</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-accent/60"
                placeholder="/path/to/Qwen2.5-0.5B  (tokenizer.json 포함 디렉토리)"
                value={modelDir}
                onChange={(e) => setModelDir(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInit()}
              />
              <button
                onClick={handleInit}
                disabled={isLoading || !modelDir.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-accent/80 hover:bg-accent text-white text-[12px] rounded font-medium disabled:opacity-40 transition-colors"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                로드
              </button>
            </div>
            <p className="text-[10px] text-white/30 leading-relaxed">
              Qwen2.5-0.5B 아키텍처 전용 (burn/wgpu). tokenizer.json, config.json이 필요합니다.<br />
              가중치 파일(safetensors)이 없으면 랜덤 초기화로 구조 테스트만 가능합니다.
            </p>
          </section>

          {/* 오류 표시 */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-400">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* 상태 */}
          {status && (
            <div className="flex items-start gap-2 px-3 py-2 bg-white/5 border border-white/8 rounded text-[11px] text-white/60">
              {isModelLoaded
                ? <CheckCircle size={12} className="mt-0.5 shrink-0 text-green-400" />
                : <AlertCircle size={12} className="mt-0.5 shrink-0 text-yellow-400" />}
              {status}
            </div>
          )}

          {!status && (
            <button onClick={checkStatus} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">
              현재 상태 확인
            </button>
          )}

          {/* 생성 섹션 */}
          <section className="space-y-2">
            <p className="text-[11px] font-medium text-white/60 uppercase tracking-wide">텍스트 생성</p>

            <div className="flex items-center gap-3">
              <label className="text-[11px] text-white/40 shrink-0">최대 토큰</label>
              <input
                type="number"
                min={16}
                max={512}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-[12px] text-white/80 focus:outline-none focus:border-accent/60"
              />
            </div>

            <textarea
              ref={promptRef}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-accent/60 resize-none"
              placeholder="프롬프트를 입력하세요..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !isModelLoaded || !prompt.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600/70 hover:bg-green-600 text-white text-[12px] rounded font-medium disabled:opacity-40 transition-colors"
            >
              {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              생성
            </button>

            {!isModelLoaded && (
              <p className="text-[10px] text-yellow-400/60">모델을 먼저 로드해야 생성이 가능합니다.</p>
            )}
          </section>

          {/* 생성 오류 */}
          {genError && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-400">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {genError}
            </div>
          )}

          {/* 출력 */}
          {output !== null && (
            <section className="space-y-1.5">
              <p className="text-[11px] font-medium text-white/60 uppercase tracking-wide">출력</p>
              <pre className="w-full bg-black/30 border border-white/8 rounded p-3 text-[12px] text-green-300/90 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {output || "(빈 출력)"}
              </pre>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
