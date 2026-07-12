import { useState, useCallback, useRef } from "react";

export interface CommandBlock {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
}

export interface CommandBlocksMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getCommandBlocksMeta(blocks: CommandBlock[]): CommandBlocksMeta {
  const total = blocks.length;
  const failed = blocks.filter((block) => block.exitCode !== null && block.exitCode !== 0).length;
  const last = blocks[blocks.length - 1];
  const lastLabel = last
    ? last.exitCode === 0 || last.exitCode === null
      ? "최근 성공"
      : "최근 실패"
    : "최근 실행 대기";

  return {
    title: total > 0 ? `커맨드 블록 ${total}개` : "커맨드 블록이 없습니다",
    badges: [`전체 ${total}개`, `실패 ${failed}개`, lastLabel],
    helper: total > 0
      ? "최근 실행 히스토리를 기반으로 성공/실패 흐름과 후속 비교 작업을 이어갈 수 있습니다."
      : "터미널 실행이 시작되면 커맨드 블록이 쌓이고 이후 실패 분석이나 비교 흐름으로 이어집니다.",
  };
}

// ANSI CSI 시퀀스 및 캐리지 리턴 제거 (OSC는 별도 파싱)
const stripCsi = (s: string) =>
  s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "");

export const useCommandBlocks = () => {
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);

  // 진행 중인 블록 드래프트 (렌더 없이 변경)
  const draftRef = useRef<{
    id: string;
    command: string;
    output: string;
    startedAt: number;
  } | null>(null);

  // 청크 경계에서 잘린 불완전한 OSC 시퀀스 버퍼
  const oscBufRef = useRef("");

  const feedRaw = useCallback((raw: string) => {
    const data = oscBufRef.current + raw;
    oscBufRef.current = "";
    let pos = 0;

    while (pos < data.length) {
      const escIdx = data.indexOf("\x1b]133;", pos);

      if (escIdx === -1) {
        if (draftRef.current) {
          draftRef.current.output += stripCsi(data.slice(pos));
        }
        break;
      }

      // OSC 이전 텍스트 누적
      if (draftRef.current && escIdx > pos) {
        draftRef.current.output += stripCsi(data.slice(pos, escIdx));
      }

      const termIdx = data.indexOf("\x07", escIdx);
      if (termIdx === -1) {
        // 불완전한 OSC — 다음 청크에서 처리
        oscBufRef.current = data.slice(escIdx);
        break;
      }

      // "\x1b]" (2) + "133;" (4) = 6 chars prefix
      const inner = data.slice(escIdx + 2, termIdx); // e.g. "133;C;command"
      pos = termIdx + 1;

      if (!inner.startsWith("133;")) continue;

      const rest = inner.slice(4); // e.g. "C;command" or "D;0" or "A"
      const seq = rest[0];
      const param = rest.length > 2 && rest[1] === ";" ? rest.slice(2) : undefined;

      if (seq === "A") {
        // 프롬프트 시작 — 이전 드래프트 파기
        draftRef.current = null;
      } else if (seq === "C") {
        // 커맨드 실행 시작
        draftRef.current = {
          id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          command: param ?? "",
          output: "",
          startedAt: Date.now(),
        };
      } else if (seq === "D" && draftRef.current) {
        // 커맨드 완료
        const code = param !== undefined && param !== "" ? parseInt(param, 10) : null;
        const block: CommandBlock = {
          ...draftRef.current,
          exitCode: code !== null && isNaN(code) ? null : code,
          endedAt: Date.now(),
        };
        setBlocks((prev) => {
          const next = [...prev, block];
          return next.length > 200 ? next.slice(-200) : next;
        });
        draftRef.current = null;
      }
    }
  }, []);

  const clearBlocks = useCallback(() => {
    setBlocks([]);
    draftRef.current = null;
    oscBufRef.current = "";
  }, []);

  return { blocks, feedRaw, clearBlocks };
};
