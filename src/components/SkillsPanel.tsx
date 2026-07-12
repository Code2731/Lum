// Phase 127 — Skills 패널. 사용자가 자연어 task 절차를 markdown으로 저장 → ReAct가 자동 매칭.
//
// "한 번 푼 문제는 두 번 풀지 않는다" — Hermes Agent의 agentskills.io와 결이 같음.
// LUM의 LoRA(Phase 119)는 weight 단위라 즉시 재사용 안 되고, skill은 prompt-level memo라
// 즉시 효과. 두 시스템 직교적.

import React, { useCallback, useMemo, useState } from "react";
import { Library, Plus, Trash2, Save, X as XIcon, Search, Sparkles, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { getSkillsMeta, useSkills, type Skill, type SkillDraft } from "../hooks/useSkills";
import { fmtShortDate } from "../utils";

interface Props {
  onClose: () => void;
}

export interface SkillsPanelFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export interface SkillsPanelListStateMeta {
  ariaLabel: string;
  title: string;
  description: string;
}

export function getSkillsListStateMeta(loading: boolean, skillCount: number): SkillsPanelListStateMeta {
  if (loading) {
    return {
      ariaLabel: "스킬 라이브러리 로딩 중",
      title: "로딩 중…",
      description: "저장된 스킬 절차를 불러오고 있습니다.",
    };
  }

  if (skillCount === 0) {
    return {
      ariaLabel: "스킬 라이브러리 빈 상태",
      title: "저장된 스킬이 없습니다.",
      description: "반복적으로 풀던 문제 절차를 저장해두면 다음에 ReAct가 자연어 매칭으로 자동 호출합니다.",
    };
  }

  return {
    ariaLabel: `스킬 라이브러리 목록 · ${skillCount}개`,
    title: `스킬 ${skillCount}개`,
    description: "저장된 스킬 절차를 바로 편집하거나 삭제할 수 있습니다.",
  };
}

export interface SkillEditorFooterMeta {
  helper: string;
  saveLabel: string;
}

const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  triggers: [],
  when_to_use: "",
  quick_reference: "",
  procedure: "",
  pitfalls: "",
  verification: "",
};

function copyText(text: string) {
  navigator.clipboard?.writeText?.(text).catch(() => {});
}

export function getSkillsLibraryFlowSummary(
  skills: Skill[],
  visibleSkills: Skill[],
  importUrl: string,
): SkillsPanelFlowSummary {
  const hasFilter = visibleSkills.length !== skills.length;
  const hasImportUrl = importUrl.trim().length > 0;

  return {
    badges: [
      hasFilter ? `검색 결과 ${visibleSkills.length}개` : `전체 스킬 ${skills.length}개`,
      hasImportUrl ? "가져오기 URL 준비" : "다음 URL 가져오기",
      "마지막 새 스킬 작성",
    ],
    helper: hasFilter
      ? "검색으로 필요한 스킬 범위를 좁혔습니다. 결과를 확인한 뒤 URL 가져오기나 새 스킬 작성으로 바로 이어갈 수 있습니다."
      : "기존 스킬을 먼저 훑고, 필요하면 URL로 가져오거나 새 스킬을 작성해 라이브러리를 확장합니다.",
  };
}

export function getSkillsEmptyFlowSummary(): SkillsPanelFlowSummary {
  return {
    badges: ["현재 스킬 없음", "다음 절차 저장", "마지막 ReAct 자동 호출"],
    helper: "반복 작업 절차를 스킬로 저장해두면 다음에는 자연어 goal과 매칭되어 ReAct에 자동 주입됩니다.",
  };
}

export function getSkillEditorFlowSummary(draft: SkillDraft): SkillsPanelFlowSummary {
  const triggerCount = draft.triggers.length;
  const hasVerification = (draft.verification ?? "").trim().length > 0;

  return {
    badges: [
      draft.name.trim() ? "이름 입력 완료" : "먼저 이름 입력",
      triggerCount > 0 ? `트리거 ${triggerCount}개 연결` : "다음 트리거 정리",
      hasVerification ? "마지막 검증까지 작성" : "마지막 검증 저장",
    ],
    helper: hasVerification
      ? "이름, 트리거, 검증까지 채워져 있습니다. 절차를 다듬고 저장하면 다음 ReAct 흐름에서 바로 재사용됩니다."
      : "이름과 트리거로 검색 가능성을 먼저 정하고, 절차와 검증을 채운 뒤 저장하면 다음 ReAct 흐름에서 바로 재사용됩니다.",
  };
}

export function getSkillEditorFooterMeta(saving: boolean): SkillEditorFooterMeta {
  return {
    helper: "저장하면 검색과 자연어 매칭 흐름에 즉시 반영됩니다.",
    saveLabel: saving ? "저장 중…" : "저장",
  };
}

const SkillsPanel: React.FC<Props> = ({ onClose }) => {
  const { skills, loading, error, save, remove, importFromUrl } = useSkills();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const startEdit = useCallback((s: Skill) => {
    setEditingId(s.id);
    setDraft({
      id: s.id,
      name: s.name,
      description: s.description,
      triggers: s.triggers,
      when_to_use: s.when_to_use ?? "",
      quick_reference: s.quick_reference ?? "",
      procedure: s.procedure,
      pitfalls: s.pitfalls ?? "",
      verification: s.verification ?? "",
    });
    setSaveError(null);
  }, []);

  const startNew = useCallback(() => {
    setEditingId("new");
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft.name.trim()) {
      setSaveError("이름은 필수입니다.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await save(draft);
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [draft, save]);

  const visibleSkills = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.triggers.some((t) => t.toLowerCase().includes(q)) ||
      s.procedure.toLowerCase().includes(q) ||
      (s.when_to_use ?? "").toLowerCase().includes(q) ||
      (s.quick_reference ?? "").toLowerCase().includes(q) ||
      (s.pitfalls ?? "").toLowerCase().includes(q) ||
      (s.verification ?? "").toLowerCase().includes(q)
    );
  }, [skills, filter]);

  const handleImportUrl = useCallback(async () => {
    const url = importUrl.trim();
    if (!url) {
      setSaveError("URL을 입력하세요.");
      return;
    }
    setImporting(true);
    setSaveError(null);
    try {
      await importFromUrl(url);
      setImportUrl("");
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setImporting(false);
    }
  }, [importFromUrl, importUrl]);

  const isEditing = editingId !== null;
  const libraryFlow = getSkillsLibraryFlowSummary(skills, visibleSkills, importUrl);
  const skillsMeta = getSkillsMeta(skills, loading);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="lum-sidepanel sm:max-w-[760px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden border-white/12 rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10 bg-white/[0.02] shrink-0">
          <Library size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">스킬 — 절차 라이브러리</DialogTitle>
          <span className="text-xs text-white/35 ml-1">자연어 매칭 → ReAct에 자동 주입</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded border border-white/[0.1] text-white/40 hover:text-white/75 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="닫기"
          >
            <XIcon size={12} />
          </button>
        </div>

        {!isEditing && (
          <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] shrink-0 flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 max-w-md relative">
              <Search size={12} className="absolute left-2.5 text-white/30" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="이름/설명/트리거/본문에서 검색…"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <span className="text-sm text-white/45 tabular-nums">
              {visibleSkills.length} / {skills.length}
            </span>
            <Button size="sm" className="h-7 gap-1.5 text-xs border border-accent/35 bg-accent/20 hover:bg-accent/30" onClick={startNew}>
              <Plus size={12} /> 새 스킬
            </Button>
          </div>
        )}

        {!isEditing && (
          <div className="px-5 py-2 border-b border-white/10 bg-white/[0.015] shrink-0">
            <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-sm font-medium text-white/88">{skillsMeta.title}</p>
              <p className="mt-1 text-xs text-white/42">{skillsMeta.helper}</p>
            </div>
            <ActionFlowBar
              badges={libraryFlow.badges}
              helper={libraryFlow.helper}
            />
          </div>
        )}

        {!isEditing && (
          <div className="px-5 py-2.5 border-b border-white/10 bg-white/[0.015] shrink-0 flex items-center gap-2">
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="SKILL.md URL (예: https://.../SKILL.md)"
              className="h-7 text-xs font-mono"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs border-white/[0.18] bg-white/[0.03] hover:bg-white/[0.08]" onClick={handleImportUrl} disabled={importing}>
              {importing ? "가져오는 중…" : "URL 가져오기"}
            </Button>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 text-sm text-rose-300 bg-rose-500/10 border-b border-rose-400/20 shrink-0 flex items-start gap-2">
            <span className="min-w-0 break-words">{error}</span>
            <IconButton
              tooltip="오류 텍스트 복사"
              onClick={() => copyText(error)}
              className="p-1 rounded text-white/60 hover:text-white/85 hover:bg-white/10 transition-colors"
            >
              <Copy size={11} />
            </IconButton>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {isEditing ? (
            <SkillEditor
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              error={saveError}
              onSave={handleSave}
              onCancel={cancelEdit}
            />
          ) : (
            <SkillList
              loading={loading}
              skills={visibleSkills}
              onEdit={startEdit}
              onDelete={remove}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SkillList: React.FC<{
  loading: boolean;
  skills: Skill[];
  onEdit: (s: Skill) => void;
  onDelete: (id: string) => Promise<void>;
}> = ({ loading, skills, onEdit, onDelete }) => {
  const emptyFlow = getSkillsEmptyFlowSummary();
  const listStateMeta = getSkillsListStateMeta(loading, skills.length);

  if (loading) {
    return (
      <div aria-label={listStateMeta.ariaLabel} className="text-center py-8 space-y-1">
        <p className="text-xs text-white/40">{listStateMeta.title}</p>
        <p className="text-xs text-white/25">{listStateMeta.description}</p>
      </div>
    );
  }
  if (skills.length === 0) {
    return (
      <div aria-label={listStateMeta.ariaLabel} className="text-center py-10 text-xs text-white/35 space-y-3 px-5">
        <Sparkles size={20} className="mx-auto text-white/20" />
        <div className="max-w-md mx-auto rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left">
          <ActionFlowBar
            badges={emptyFlow.badges}
            helper={emptyFlow.helper}
          />
        </div>
        <p>{listStateMeta.title}</p>
        <p className="text-xs text-white/25 leading-relaxed">{listStateMeta.description}</p>
      </div>
    );
  }
  return (
    <div aria-label={listStateMeta.ariaLabel} className="px-5 py-3 space-y-2">
      {skills.map((s) => (
        <div key={s.id} className="rounded-lg bg-white/[0.03] border border-white/[0.1] px-3 py-2.5 hover:bg-white/[0.06] transition-colors">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white/90">{s.name}</span>
                {s.success_count > 0 && (
                  <span className="text-xs text-emerald-300/85 bg-emerald-500/10 px-1.5 py-0.5 rounded tabular-nums">
                    ✓ {s.success_count}
                  </span>
                )}
                {s.last_used_ms ? (
                  <span className="text-xs text-white/30">{fmtShortDate(s.last_used_ms, "ms")}</span>
                ) : null}
              </div>
              {s.description && (
                <p className="text-sm text-white/55 mt-0.5 line-clamp-2">{s.description}</p>
              )}
              {s.triggers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.triggers.map((t, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent/85 border border-accent/15">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onEdit(s)}
                className="text-sm px-2 py-1 rounded border border-white/[0.12] text-white/65 hover:text-white hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                편집
              </button>
              <ConfirmDeleteDialog
                itemName={s.name}
                itemType="스킬"
                onConfirm={async () => { await onDelete(s.id); }}
              >
                <button
                  type="button"
                  className="p-1.5 rounded border border-transparent text-rose-300/70 hover:text-rose-200 hover:bg-rose-500/10 hover:border-rose-400/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="삭제"
                >
                  <Trash2 size={12} />
                </button>
              </ConfirmDeleteDialog>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SkillEditor: React.FC<{
  draft: SkillDraft;
  setDraft: React.Dispatch<React.SetStateAction<SkillDraft>>;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}> = ({ draft, setDraft, saving, error, onSave, onCancel }) => {
  const triggerInput = draft.triggers.join(", ");
  const editorFlow = getSkillEditorFlowSummary(draft);
  const footerMeta = getSkillEditorFooterMeta(saving);

  return (
    <div className="px-5 py-4 space-y-3 bg-white/[0.01]">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <ActionFlowBar
          badges={editorFlow.badges}
          helper={editorFlow.helper}
        />
      </div>
      <div>
        <label className="text-sm text-white/55 mb-1 block">이름 *</label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Git rebase 충돌 정리"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <label className="text-sm text-white/55 mb-1 block">한 줄 설명</label>
        <Input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="복잡한 rebase 충돌을 단계별로 해결하는 절차"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <label className="text-sm text-white/55 mb-1 block">트리거 키워드 (쉼표로 구분)</label>
        <Input
          value={triggerInput}
          onChange={(e) => setDraft((d) => ({
            ...d,
            triggers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
          }))}
          placeholder="rebase, 충돌, conflict"
          className="h-8 text-xs"
        />
        <p className="text-xs text-white/30 mt-1">
          자연어 goal과 단어가 겹칠수록 ReAct가 이 Skill을 우선 로드합니다.
        </p>
      </div>
      <div>
        <label className="text-sm text-white/55 mb-1 block">절차 (Markdown)</label>
        <Textarea
          value={draft.procedure}
          onChange={(e) => setDraft((d) => ({ ...d, procedure: e.target.value }))}
          placeholder={`1. git status로 충돌 파일 목록 확인\n2. 각 파일 수정 후 git add\n3. git rebase --continue\n4. 다음 충돌 반복`}
          className="text-xs font-mono leading-relaxed min-h-[180px]"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-white/55 mb-1 block">사용 시점</label>
          <Textarea
            value={draft.when_to_use ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, when_to_use: e.target.value }))}
            placeholder="언제 이 스킬을 쓰는지"
            className="text-xs leading-relaxed min-h-[88px]"
          />
        </div>
        <div>
          <label className="text-sm text-white/55 mb-1 block">빠른 참조</label>
          <Textarea
            value={draft.quick_reference ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, quick_reference: e.target.value }))}
            placeholder="핵심 커맨드/요약"
            className="text-xs leading-relaxed min-h-[88px]"
          />
        </div>
        <div>
          <label className="text-sm text-white/55 mb-1 block">주의점</label>
          <Textarea
            value={draft.pitfalls ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, pitfalls: e.target.value }))}
            placeholder="자주 하는 실수"
            className="text-xs leading-relaxed min-h-[88px]"
          />
        </div>
        <div>
          <label className="text-sm text-white/55 mb-1 block">검증</label>
          <Textarea
            value={draft.verification ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, verification: e.target.value }))}
            placeholder="완료 검증 방법"
            className="text-xs leading-relaxed min-h-[88px]"
          />
        </div>
      </div>
      {error && (
        <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded px-2.5 py-1.5 flex items-start gap-2">
          <span className="min-w-0 break-words flex-1">{error}</span>
          <IconButton
            tooltip="오류 텍스트 복사"
            onClick={() => copyText(error)}
            className="p-1 rounded text-white/60 hover:text-white/85 hover:bg-white/10 transition-colors"
          >
            <Copy size={11} />
          </IconButton>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/8">
        <span className="mr-auto text-xs text-white/35">{footerMeta.helper}</span>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-white/[0.2] bg-white/[0.03] hover:bg-white/[0.08]" onClick={onCancel} disabled={saving}>
          <XIcon size={12} /> 취소
        </Button>
        <Button size="sm" className="h-7 gap-1.5 text-xs border border-accent/35 bg-accent/20 hover:bg-accent/30" onClick={onSave} disabled={saving}>
          <Save size={12} /> {footerMeta.saveLabel}
        </Button>
      </div>
    </div>
  );
};

export default SkillsPanel;
