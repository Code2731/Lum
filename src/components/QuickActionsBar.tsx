import React, { useState } from "react";
import { Plus, Settings2, Zap } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import type { QuickAction } from "../hooks/useQuickActions";
import QuickActionsEditor from "./QuickActionsEditor";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface Props {
  actions: QuickAction[];
  onExecute: (cmd: string) => void;
  onAdd: (a: Omit<QuickAction, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<QuickAction, "id">>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

export interface QuickActionsBarFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getQuickActionsBarFlowSummary(actions: QuickAction[]): QuickActionsBarFlowSummary {
  if (actions.length === 0) {
    return {
      badges: ["현재 비어 있음", "다음 액션 추가", "마지막 즉시 실행 준비"],
      helper:
        "빠른 액션이 아직 비어 있습니다. 편집 버튼에서 명령을 추가하고 단축키까지 연결해 두면 다음부터는 한 번에 실행할 수 있습니다.",
    };
  }

  const shortcutCount = actions.filter(action => action.shortcut != null).length;
  const shortcutLabel = shortcutCount > 0 ? `단축키 ${shortcutCount}개 연결` : "단축키 미연결";

  return {
    badges: [`현재 액션 ${actions.length}개`, shortcutLabel, "마지막 편집에서 정리"],
    helper:
      shortcutCount > 0
        ? "등록된 빠른 액션을 바로 실행할 수 있습니다. 필요하면 편집에서 순서와 단축키를 함께 다듬어 흐름을 유지합니다."
        : "등록된 빠른 액션은 준비됐지만 단축키가 아직 없습니다. 편집에서 자주 쓰는 명령부터 단축키를 연결하면 더 빠르게 실행할 수 있습니다.",
  };
}

const QuickActionsBar: React.FC<Props> = ({
  actions, onExecute, onAdd, onUpdate, onDelete, onMove,
}) => {
  const [showEditor, setShowEditor] = useState(false);
  const actionCountLabel = `등록 ${actions.length}개`;
  const flow = getQuickActionsBarFlowSummary(actions);

  return (
    <>
      <div className="lum-quickbar border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 overflow-x-auto">
          <Zap size={12} className="text-accent/80 shrink-0 mr-0.5" />
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/52 shrink-0">
            {actionCountLabel}
          </span>

          {actions.length === 0 && (
            <span className="text-xs text-white/38 mr-1">빠른 실행 없음 · 오른쪽 설정에서 추가</span>
          )}

          {actions.map(a => (
            <button
              key={a.id}
              onClick={() => onExecute(a.command)}
              title={a.command}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/[0.12] hover:bg-white/[0.09] hover:border-accent/35 transition-all text-xs font-medium text-white/72 hover:text-white whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {a.label}
              {a.shortcut != null && (
                <span className="text-xs text-white/36 group-hover:text-accent/80 font-mono">
                  Cmd/Ctrl+{a.shortcut}
                </span>
              )}
            </button>
          ))}

          <IconButton
            tooltip="빠른 액션 편집"
            description={
              actions.length === 0
                ? "반복 실행할 명령을 새로 추가하고, 단축키까지 연결해 빠른 실행 바를 바로 채웁니다."
                : "등록된 액션의 순서, 이름, 명령, 단축키를 한곳에서 정리합니다."
            }
            onClick={() => setShowEditor(true)}
            className="ml-auto p-1.5 rounded-md border border-white/[0.12] text-white/45 hover:text-white/80 hover:bg-white/[0.08] transition-colors shrink-0"
          >
            {actions.length === 0
              ? <Plus size={SMALL_ICON_SIZE} />
              : <Settings2 size={SMALL_ICON_SIZE} />
            }
          </IconButton>
        </div>

        <div className="px-2.5 py-2 border-t border-white/8 bg-white/[0.015]">
          <ActionFlowBar
            badges={flow.badges}
            helper={flow.helper}
          />
        </div>
      </div>

      {showEditor && (
        <QuickActionsEditor
          actions={actions}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onMove={onMove}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
};

export default QuickActionsBar;
