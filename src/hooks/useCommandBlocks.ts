import { useState, useCallback, useRef } from "react";

export interface CommandBlock {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
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
