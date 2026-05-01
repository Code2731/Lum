// Phase 117 — Auto-Heal 학습 데이터셋 패널.
// 사용자가 승인/거부한 자동치유 결정을 누적 → 외부 LoRA fine-tune(mlx-lm/axolotl)에 사용.

import React, { useCallback, useEffect, useState } from "react";
import { Sparkles, Download, Trash2, Check, X as XIcon, Wrench } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { Button } from "@/components/ui/button";
import { fmtShortDate } from "../utils";

type SafetyLevel = "Safe" | "Warning" | "Dangerous" | "Blocked";

interface HealingRecord {
  ts_ms: number;
  model: string;
  error: string;
  analysis: string;
  suggestion: string;
  safety_level: SafetyLevel;
  decision: "approve" | "reject";
  applied_command?: string | null;
  /** Phase 122 — reject 시 "왜 잘못된 제안인지" LLM이 한 줄 분석 */
  failure_reason?: string | null;
}

interface Props {
  onClose: () => void;
}

const SAFETY_TONE: Record<SafetyLevel, string> = {
  Safe: "text-emerald-300 bg-emerald-400/10",
  Warning: "text-amber-300 bg-amber-400/10",
  Dangerous: "text-rose-300 bg-rose-400/10",
  Blocked: "text-rose-400 bg-rose-500/15",
};

const HealingDatasetPanel: React.FC<Props> = ({ onClose }) => {
  const [records, setRecords] = useState<HealingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportInfo, setExportInfo] = useState<{ count: number; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await invoke<HealingRecord[]>("list_healing_dataset");
      rows.sort((a, b) => b.ts_ms - a.ts_ms);
      setRecords(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: "jsonl" | "chatml") => {
    setError(null);
    try {
      const [count, path] = await invoke<[number, string]>("export_healing_dataset", {
        format,
        outputPath: null,
      });
      setExportInfo({ count, path });
    } catch (e) {
      setError(String(e));
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await invoke("clear_healing_dataset");
      setRecords([]);
      setExportInfo(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const approveCount = records.filter((r) => r.decision === "approve").length;
  const rejectCount = records.length - approveCount;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <Sparkles size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">Auto-Heal 학습 데이터셋</DialogTitle>
          <span className="text-[10px] text-white/35 ml-1">로컬 LoRA fine-tune용</span>
        </div>

        <div className="px-5 py-3 border-b border-white/8 shrink-0 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-[11px] text-white/60">
            <span>총 <span className="tabular-nums text-white/85 font-semibold">{records.length}</span>개</span>
            <span className="flex items-center gap-1 text-emerald-300">
              <Check size={11} /> <span className="tabular-nums">{approveCount}</span>
            </span>
            <span className="flex items-center gap-1 text-rose-300">
              <XIcon size={11} /> <span className="tabular-nums">{rejectCount}</span>
            </span>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => handleExport("chatml")}>
            <Download size={12} /> ChatML export
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => handleExport("jsonl")}>
            <Download size={12} /> 원본 JSONL
          </Button>
          <ConfirmDeleteDialog
            itemName="전체 데이터셋"
            itemType="학습 데이터"
            description={`${records.length}개 결정 기록이 삭제됩니다. 이미 export된 파일은 유지됩니다.`}
            onConfirm={handleClear}
          >
            <button
              className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-rose-300 bg-rose-500/10 border border-rose-400/25 hover:bg-rose-500/20 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              type="button"
            >
              <Trash2 size={12} /> 전체 삭제
            </button>
          </ConfirmDeleteDialog>
        </div>

        {exportInfo && (
          <div className="px-5 py-2 bg-accent/10 border-b border-accent/20 text-[11px] text-white/80 shrink-0">
            ✓ <span className="tabular-nums font-semibold">{exportInfo.count}</span>개 라인 export 완료 →
            <span className="ml-1 font-mono text-white/60">{exportInfo.path}</span>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 text-[11px] text-rose-300 bg-rose-500/10 border-b border-rose-400/20 shrink-0">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0 space-y-2">
          {loading && <p className="text-xs text-white/40 text-center py-6">로딩 중…</p>}
          {!loading && records.length === 0 && (
            <div className="text-center py-8 text-xs text-white/35 space-y-1.5">
              <Wrench size={20} className="mx-auto text-white/20" />
              <p>아직 수집된 결정이 없습니다.</p>
              <p className="text-[10px] text-white/25">자동치유 제안을 승인/거부할 때마다 여기에 누적됩니다.</p>
            </div>
          )}

          {records.map((r, i) => (
            <details key={`${r.ts_ms}-${i}`} className="group rounded-lg bg-white/3 border border-white/7 overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-xs hover:bg-white/3">
                {r.decision === "approve" ? (
                  <Check size={11} className="text-emerald-300 shrink-0" />
                ) : (
                  <XIcon size={11} className="text-rose-300 shrink-0" />
                )}
                <span className="truncate flex-1 text-white/85 font-mono">{r.suggestion || "(빈 제안)"}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${SAFETY_TONE[r.safety_level]}`}>
                  {r.safety_level}
                </span>
                <span className="text-[10px] text-white/30 tabular-nums shrink-0">{fmtShortDate(r.ts_ms, "ms")}</span>
              </summary>
              <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 text-[11px] border-t border-white/5">
                <div>
                  <span className="text-white/35">에러:</span>
                  <pre className="mt-0.5 text-white/70 font-mono whitespace-pre-wrap text-[10.5px] bg-black/20 rounded px-2 py-1.5 max-h-24 overflow-y-auto">{r.error}</pre>
                </div>
                {r.analysis && (
                  <div>
                    <span className="text-white/35">분석:</span>
                    <p className="mt-0.5 text-white/65 leading-relaxed">{r.analysis}</p>
                  </div>
                )}
                {r.applied_command && r.applied_command !== r.suggestion && (
                  <div>
                    <span className="text-white/35">실제 실행:</span>
                    <pre className="mt-0.5 text-emerald-200 font-mono whitespace-pre-wrap text-[10.5px] bg-emerald-500/5 rounded px-2 py-1.5">{r.applied_command}</pre>
                  </div>
                )}
                {r.decision === "reject" && r.failure_reason && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded px-2 py-1.5">
                    <span className="text-amber-300 font-medium shrink-0">거부 사유:</span>
                    <span className="leading-relaxed">{r.failure_reason}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] text-white/30">
                  <span>모델: {r.model}</span>
                </div>
              </div>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HealingDatasetPanel;
