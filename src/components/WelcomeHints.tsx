import { Sparkles, Hash, HelpCircle, Search, GitBranch, FolderTree, Command } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface Props {
  onClose: () => void;
}

const HINTS = [
  { icon: Hash,        keys: "#",            desc: "자연어 → 커맨드 변환" },
  { icon: HelpCircle,  keys: "?",            desc: "커맨드 설명 팝업" },
  { icon: Command,     keys: "Tab",          desc: "Ghost Text 자동완성 확정" },
  { icon: FolderTree,  keys: "Cmd/Ctrl+B",   desc: "파일 탐색기 토글" },
  { icon: Search,      keys: "Cmd/Ctrl+F",   desc: "터미널 검색" },
  { icon: GitBranch,   keys: "Cmd/Ctrl+Shift+G", desc: "AI 커밋 메시지 생성" },
];

export interface WelcomeHintsFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getWelcomeHintsFlowSummary(hintCount: number): WelcomeHintsFlowSummary {
  return {
    primary: "시작 힌트 확인",
    secondary: `${hintCount}개 단축키`,
    detail: "AI 입력 방식과 핵심 단축키를 먼저 훑고, 탐색·검색 기능까지 익힌 뒤 바로 터미널 흐름을 시작할 수 있습니다.",
  };
}

export default function WelcomeHints({ onClose }: Props) {
  const flowSummary = getWelcomeHintsFlowSummary(HINTS.length);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[460px] gap-0 p-0 overflow-hidden border-white/10 rounded-xl bg-[#141824]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
          <Sparkles size={14} className="text-accent" />
          <DialogTitle className="text-sm font-semibold text-white/90">LUM — AI 터미널 힌트</DialogTitle>
        </div>

        <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
          <ActionFlowBar
            badges={[flowSummary.primary, flowSummary.secondary, "마지막 바로 시작"]}
            helper={flowSummary.detail}
          />
        </div>

        <div className="px-4 py-4 space-y-2">
          <p className="text-sm text-white/50 mb-3">
            이 터미널은 AI 기능을 내장하고 있습니다. 아래 단축키로 바로 사용하세요.
          </p>
          {HINTS.map(({ icon: Icon, keys, desc }) => (
            <div key={keys} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/3">
              <Icon size={SMALL_ICON_SIZE} className="text-accent/70 shrink-0" />
              <code className="text-sm font-mono px-2 py-0.5 bg-white/8 rounded text-white/80 min-w-[90px] text-center">
                {keys}
              </code>
              <span className="text-sm text-white/70">{desc}</span>
            </div>
          ))}

          <div className="mt-3 pt-3 border-t border-white/5 text-xs text-white/40 space-y-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <ActionFlowBar
                badges={["예시 확인", "바로 입력", "명령 초안 시작"]}
                helper="예시 문장을 그대로 따라 입력해 보면 자연어에서 명령 초안으로 이어지는 흐름을 바로 체감할 수 있습니다."
              />
            </div>
            💡 자연어 예시: <code className="text-white/55">#현재 폴더의 큰 파일 찾기</code>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/8 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-accent text-sm font-medium"
          >
            시작하기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
