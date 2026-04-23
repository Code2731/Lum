import React, { useState } from "react";
import { Clipboard, Play, SkipForward, Square, X, ChevronRight } from "lucide-react";

interface Props {
  lines: string[];
  rawText: string;
  onRunAll: () => void;
  onPasteText: () => void;
  onClose: () => void;
  writeLine: (line: string) => void;
}

const SmartPasteModal: React.FC<Props> = ({
  lines, rawText, onRunAll, onPasteText, onClose, writeLine,
}) => {
  const [stepping, setStepping] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  if (stepping) {
    const done = currentIdx >= lines.length;

    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-[480px] bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-white/3">
            <Play size={12} className="text-accent shrink-0" />
            <span className="text-[11px] font-semibold text-accent">단계별 실행</span>
            <span className="text-[10px] text-white/30 ml-auto">
              {done ? "완료" : `${currentIdx + 1} / ${lines.length}`}
            </span>
            <button
              onClick={onClose}
              className="ml-2 text-white/30 hover:text-white/60 transition-colors p-0.5 rounded"
            >
              <X size={11} />
            </button>
          </div>

          {done ? (
            <div className="p-4 flex flex-col items-center gap-3">
              <span className="text-[13px] text-green-400 font-medium">모든 명령어 실행 완료</span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-[11px] rounded-md bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
              >
                닫기
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {/* 현재 명령어 */}
              <div className="rounded-lg bg-white/3 border border-accent/20 p-2.5">
                <p className="text-[10px] text-accent/60 mb-1 uppercase tracking-wider">현재 명령어</p>
                <p className="font-mono text-[12px] text-white/80 break-all">
                  <span className="text-white/30">$ </span>{lines[currentIdx]}
                </p>
              </div>

              {/* 남은 목록 미리보기 */}
              {currentIdx + 1 < lines.length && (
                <div className="space-y-1">
                  <p className="text-[10px] text-white/25 uppercase tracking-wider">다음 ({lines.length - currentIdx - 1}개)</p>
                  {lines.slice(currentIdx + 1, currentIdx + 4).map((l, i) => (
                    <p key={i} className="font-mono text-[10px] text-white/25 truncate pl-1">
                      <span className="text-white/15">$</span> {l}
                    </p>
                  ))}
                  {lines.length - currentIdx - 1 > 3 && (
                    <p className="text-[10px] text-white/15 pl-1">…+{lines.length - currentIdx - 4}개 더</p>
                  )}
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <Square size={10} />
                  중단
                </button>
                <button
                  onClick={() => setCurrentIdx((i) => i + 1)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  <SkipForward size={10} />
                  건너뛰기
                </button>
                <button
                  onClick={() => {
                    writeLine(lines[currentIdx]);
                    setCurrentIdx((i) => i + 1);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
                >
                  <ChevronRight size={11} />
                  실행
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] max-h-[80vh] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-white/3 shrink-0">
          <Clipboard size={12} className="text-accent shrink-0" />
          <span className="text-[11px] font-semibold text-white/80 flex-1">
            멀티라인 붙여넣기 감지 ({lines.length}개 명령어)
          </span>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors p-0.5 rounded"
          >
            <X size={11} />
          </button>
        </div>

        {/* 명령어 미리보기 */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
          {lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white/3 border border-white/5">
              <span className="text-[9px] text-white/25 font-mono mt-0.5 w-4 shrink-0">{i + 1}.</span>
              <p className="font-mono text-[11px] text-white/70 break-all">{line}</p>
            </div>
          ))}
        </div>

        {/* 액션 버튼 */}
        <div className="shrink-0 border-t border-white/5 px-3 py-2.5 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors rounded-md hover:bg-white/5"
          >
            취소
          </button>
          <button
            onClick={onPasteText}
            className="px-3 py-1.5 text-[11px] rounded-md text-white/60 bg-white/5 hover:bg-white/10 hover:text-white/80 transition-colors"
            title={rawText.length > 60 ? rawText.slice(0, 60) + "…" : rawText}
          >
            텍스트만 붙여넣기
          </button>
          <button
            onClick={() => { setStepping(true); setCurrentIdx(0); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md text-white/70 bg-white/8 hover:bg-white/12 hover:text-white/90 transition-colors"
          >
            <SkipForward size={11} />
            단계별 실행
          </button>
          <button
            onClick={onRunAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
          >
            <Play size={11} />
            한 번에 실행
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartPasteModal;
