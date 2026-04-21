import { useEffect, useRef } from "react";
import type { CommandBlock } from "./useCommandBlocks";

const THRESHOLD_MS = 10_000; // 10초 이상이면 알림

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function sendNotification(command: string, exitCode: number | null, durationSec: number) {
  const ok = exitCode === 0 || exitCode === null;
  const icon = ok ? "✅" : "❌";
  const title = `${icon} 커맨드 완료`;
  const body = `${command.slice(0, 60)}${command.length > 60 ? "…" : ""}\n${durationSec}초 소요 · 종료 코드: ${exitCode ?? 0}`;
  try {
    new Notification(title, { body, silent: false });
  } catch {}
}

export function useCommandNotifier(
  blocks: CommandBlock[],
  thresholdMs = THRESHOLD_MS,
) {
  const notifiedRef = useRef<Set<string>>(new Set());
  const permGrantedRef = useRef(false);

  // 앱 시작 시 권한 요청
  useEffect(() => {
    requestNotificationPermission().then(ok => { permGrantedRef.current = ok; });
  }, []);

  // 완료된 블록 중 threshold 초과한 것만 알림
  useEffect(() => {
    for (const b of blocks) {
      if (notifiedRef.current.has(b.id)) continue;
      if (b.endedAt === null) continue; // 아직 실행 중
      if (!b.command.trim()) continue;

      const duration = b.endedAt - b.startedAt;
      if (duration < thresholdMs) continue;

      notifiedRef.current.add(b.id);

      if (permGrantedRef.current) {
        sendNotification(b.command, b.exitCode, Math.round(duration / 1000));
      }
      // document title 플래시 (탭이 백그라운드일 때 사용자 주의 유도)
      flashTitle(b.exitCode);
    }
  }, [blocks, thresholdMs]);
}

function flashTitle(exitCode: number | null) {
  const original = document.title;
  const badge = exitCode === 0 || exitCode === null ? "✅ LUM" : "❌ LUM";
  let count = 0;
  const iv = setInterval(() => {
    document.title = count % 2 === 0 ? badge : original;
    if (++count >= 6) {
      clearInterval(iv);
      document.title = original;
    }
  }, 500);
}
