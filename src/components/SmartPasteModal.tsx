import React, { useState } from "react";
import { Clipboard, Play, SkipForward, Square, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { getSmartPasteFlowSummary } from "../utils/smartPaste";

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
  const smartPasteSummary = getSmartPasteFlowSummary(rawText);

  const done = stepping && currentIdx >= lines.length;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg gap-3 border-white/10">
        {!stepping && (
          <>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <ActionFlowBar
                badges={[smartPasteSummary.primary, smartPasteSummary.secondary, "마지막 붙여넣기 결정"]}
                helper={`${smartPasteSummary.detail} 단계별 실행이나 한 번에 실행, 텍스트만 붙여넣기 중 하나를 선택합니다.`}
              />
            </div>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Clipboard size={16} className="text-accent" />
                멀티라인 붙여넣기 감지
                <span className="ml-auto text-xs font-normal text-white/45 tabular-nums">{lines.length}개 명령어</span>
              </DialogTitle>
            </DialogHeader>

            <div className="max-h-[55vh] overflow-y-auto space-y-1 -mx-1 px-1">
              {lines.map((line, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/3 border border-white/5">
                  <span className="text-xs text-white/35 font-mono mt-0.5 w-5 shrink-0 tabular-nums">{i + 1}.</span>
                  <p className="font-mono text-xs text-white/75 break-all">{line}</p>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onPasteText}
                title={rawText.length > 60 ? rawText.slice(0, 60) + "…" : rawText}
              >
                텍스트만 붙여넣기
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setStepping(true); setCurrentIdx(0); }}>
                <SkipForward size={12} />
                단계별 실행
              </Button>
              <Button
                size="sm"
                onClick={onRunAll}
                className="bg-accent/20 text-accent hover:bg-accent/30 border-0 shadow-none"
              >
                <Play size={12} />
                한 번에 실행
              </Button>
            </DialogFooter>
          </>
        )}

        {stepping && !done && (
          <>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <ActionFlowBar
                badges={["현재 명령 확인", "다음 명령 미리보기", "마지막 실행·건너뛰기"]}
                helper="현재 명령을 먼저 보고, 뒤에 이어질 명령을 확인한 뒤 실행하거나 건너뛰면서 진행합니다."
              />
            </div>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Play size={14} className="text-accent" />
                단계별 실행
                <span className="ml-auto text-xs font-normal text-white/45 tabular-nums">
                  {currentIdx + 1} / {lines.length}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-md bg-white/3 border border-accent/30 p-3">
              <p className="text-xs text-accent/70 mb-1.5 uppercase tracking-wider font-semibold">현재 명령어</p>
              <p className="font-mono text-sm text-white/85 break-all">
                <span className="text-white/30">$ </span>{lines[currentIdx]}
              </p>
            </div>

            {currentIdx + 1 < lines.length && (
              <div className="space-y-1">
                <p className="text-xs text-white/35 uppercase tracking-wider font-semibold">
                  다음 ({lines.length - currentIdx - 1}개)
                </p>
                {lines.slice(currentIdx + 1, currentIdx + 4).map((l, i) => (
                  <p key={i} className="font-mono text-xs text-white/40 truncate pl-2">
                    <span className="text-white/20">$</span> {l}
                  </p>
                ))}
                {lines.length - currentIdx - 1 > 3 && (
                  <p className="text-xs text-white/25 pl-2">…+{lines.length - currentIdx - 4}개 더</p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                <Square size={12} />
                중단
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentIdx((i) => i + 1)}>
                <SkipForward size={12} />
                건너뛰기
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  writeLine(lines[currentIdx]);
                  setCurrentIdx((i) => i + 1);
                }}
                className="bg-accent/20 text-accent hover:bg-accent/30 border-0 shadow-none"
              >
                <ChevronRight size={12} />
                실행
              </Button>
            </DialogFooter>
          </>
        )}

        {done && (
          <div className="py-4 flex flex-col items-center gap-3">
            <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <ActionFlowBar
                badges={["실행 완료", "결과 확인", "마지막 닫기"]}
                helper="모든 명령 처리가 끝났으니 결과를 확인하고 이 모달을 닫아 현재 터미널 흐름으로 돌아갑니다."
              />
            </div>
            <span className="text-sm text-green-400 font-medium">✓ 모든 명령어 실행 완료</span>
            <Button size="sm" variant="secondary" onClick={onClose}>닫기</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SmartPasteModal;
