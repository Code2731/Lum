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

  useEffect(() => {
    requestNotificationPermission().then(ok => { permGrantedRef.current = ok; });
  }, []);

  useEffect(() => {
    for (const b of blocks) {
      if (notifiedRef.current.has(b.id)) continue;
      if (b.endedAt === null) continue;
      if (!b.command.trim()) continue;

      const duration = b.endedAt - b.startedAt;
      if (duration < thresholdMs) continue;

      notifiedRef.current.add(b.id);

      if (permGrantedRef.current) {
        sendNotification(b.command, b.exitCode, Math.round(duration / 1000));
      }
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
