import React, { useState } from "react";
import { Palette, Type, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { THEMES, FONT_FAMILIES, type TerminalAppearance } from "../hooks/useTerminalTheme";

interface Props {
  appearance: TerminalAppearance;
  onSave: (a: TerminalAppearance) => void;
  onClose: () => void;
}

export interface ThemePanelFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getThemePanelFlowSummary(appearance: TerminalAppearance): ThemePanelFlowSummary {
  return {
    primary: "테마 조합 편집",
    secondary: `${appearance.themeName} · ${appearance.fontSize}px`,
    detail: `${appearance.fontFamily} 기준으로 색상과 크기를 조정한 뒤 미리보기를 보고 바로 적용할 수 있습니다.`,
  };
}

const ThemePanel: React.FC<Props> = ({ appearance, onSave, onClose }) => {
  const [local, setLocal] = useState<TerminalAppearance>(appearance);
  const flowSummary = getThemePanelFlowSummary(local);

  const apply = () => { onSave(local); onClose(); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8">
          <Palette size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">터미널 테마 설정</DialogTitle>
          <DialogDescription className="sr-only">터미널의 색상, 글꼴, 크기 등 화면 모양을 조정합니다.</DialogDescription>
        </div>

        <div className="px-5 py-2.5 border-b border-white/10 bg-white/[0.02]">
          <ActionFlowBar
            badges={[flowSummary.primary, flowSummary.secondary, "마지막 미리보기 적용"]}
            helper={flowSummary.detail}
          />
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 테마 선택 */}
          <div>
            <p className="text-xs text-white/40 mb-2.5">색상 테마</p>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(THEMES).map(([name, theme]) => (
                <button
                  key={name}
                  onClick={() => setLocal(l => ({ ...l, themeName: name }))}
                  title={name}
                  className={`relative rounded-xl overflow-hidden border transition-all ${
                    local.themeName === name
                      ? "border-accent shadow-[0_0_0_2px_rgba(88,166,255,0.3)]"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  {/* 미니 프리뷰 */}
                  <div style={{ background: theme.background }} className="h-12 p-1.5 space-y-1">
                    <div style={{ background: theme.green }} className="h-1 w-8 rounded-full opacity-80" />
                    <div style={{ background: theme.blue }} className="h-1 w-5 rounded-full opacity-60" />
                    <div style={{ background: theme.magenta }} className="h-1 w-6 rounded-full opacity-60" />
                  </div>
                  <div style={{ background: theme.background }} className="px-1.5 py-1 border-t border-white/5">
                      <span className="text-xs" style={{ color: theme.foreground }}>
                      {name.split(" ")[0]}
                    </span>
                  </div>
                  {local.themeName === name && (
                    <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-accent flex items-center justify-center">
                      <Check size={8} strokeWidth={3} className="text-black" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 폰트 크기 */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs text-white/40 flex items-center gap-1.5">
                <Type size={11} /> 폰트 크기
              </p>
              <span className="text-xs font-mono text-accent">{local.fontSize}px</span>
            </div>
            <Slider
              min={10}
              max={20}
              step={1}
              value={[local.fontSize]}
              onValueChange={([v]) => setLocal(l => ({ ...l, fontSize: v }))}
            />
            <div className="flex justify-between text-xs text-white/20 mt-0.5">
              <span>10px</span><span>20px</span>
            </div>
          </div>

          {/* 폰트 패밀리 */}
          <div>
            <p className="text-xs text-white/40 mb-2.5">폰트</p>
            <div className="grid grid-cols-3 gap-1.5">
              {FONT_FAMILIES.map(f => (
                <button
                  key={f}
                  onClick={() => setLocal(l => ({ ...l, fontFamily: f }))}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    local.fontFamily === f
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "bg-white/4 text-white/50 border border-white/8 hover:bg-white/8"
                  }`}
                  style={{ fontFamily: f }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <ActionFlowBar
              badges={["현재 조합", "실시간 미리보기", "적용 준비"]}
              helper="위에서 고른 테마, 폰트, 크기가 즉시 반영되므로 실제 터미널 인상을 확인한 뒤 적용하면 됩니다."
            />
          </div>
          <div
            style={{
              background: THEMES[local.themeName]?.background ?? "#0d1117",
              fontFamily: local.fontFamily,
              fontSize: local.fontSize,
              color: THEMES[local.themeName]?.foreground ?? "#c9d1d9",
            }}
            className="rounded-xl px-4 py-3 font-mono leading-relaxed border border-white/8"
          >
            <span style={{ color: THEMES[local.themeName]?.green }}>✓</span>
            {" "}npm run tauri dev
            <br />
            <span style={{ color: THEMES[local.themeName]?.blue }}>{">"}</span>
            {" "}LUM 터미널 시작됨
            <span style={{ color: THEMES[local.themeName]?.cursor }} className="animate-pulse">█</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/8">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            취소
          </button>
          <button
            onClick={apply}
            className="px-4 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors text-xs font-medium"
          >
            적용
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ThemePanel;
