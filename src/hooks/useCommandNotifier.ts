import { useEffect, useRef } from "react";
import type { CommandBlock } from "./useCommandBlocks";

const THRESHOLD_MS = 10_000; // 10초 이상이면 알림
const COMMAND_PREVIEW_MAX = 60;

function isSuccessfulExit(exitCode: number | null) {
  return exitCode === 0 || exitCode === null;
}

export function getCommandNotificationBadge(exitCode: number | null): string {
  return isSuccessfulExit(exitCode) ? "✅ LUM" : "❌ LUM";
}

export function getCommandNotificationTitle(exitCode: number | null): string {
  return isSuccessfulExit(exitCode) ? "✅ 커맨드 성공" : "❌ 커맨드 실패";
}

export function getCommandNotificationPreview(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length <= COMMAND_PREVIEW_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, COMMAND_PREVIEW_MAX)}…`;
}

export function getCommandNotificationBody(
  command: string,
  exitCode: number | null,
  durationSec: number,
): string {
  const statusLine = isSuccessfulExit(exitCode)
    ? `성공 · ${durationSec}초 소요`
    : `실패 · ${durationSec}초 소요 · 종료 코드 ${exitCode}`;
  return `명령: ${getCommandNotificationPreview(command)}\n${statusLine}`;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function sendNotification(command: string, exitCode: number | null, durationSec: number) {
  const title = getCommandNotificationTitle(exitCode);
  const body = getCommandNotificationBody(command, exitCode, durationSec);
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
  const badge = getCommandNotificationBadge(exitCode);
  let count = 0;
  const iv = setInterval(() => {
    document.title = count % 2 === 0 ? badge : original;
    if (++count >= 6) {
      clearInterval(iv);
      document.title = original;
    }
  }, 500);
}
