import { describe, expect, it, vi } from "vitest";
import type { AppNotification } from "./useNotificationCenter";
import {
  createNotificationEntry,
  getUnreadNotificationCount,
  isSameNotificationContent,
  upsertNotificationList,
} from "./useNotificationCenter";

describe("useNotificationCenter helpers", () => {
  it("알림 엔트리를 읽지 않음 상태로 생성한다", () => {
    const uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    try {
      expect(
        createNotificationEntry(
          {
            type: "command",
            title: "빌드 완료",
            body: "빌드가 끝났습니다",
          },
          1234,
        ),
      ).toEqual({
        id: "00000000-0000-4000-8000-000000000001",
        type: "command",
        title: "빌드 완료",
        body: "빌드가 끝났습니다",
        timestamp: 1234,
        read: false,
      });
    } finally {
      uuidSpy.mockRestore();
    }
  });

  it("동일한 알림 내용은 type/title/body 기준으로 비교한다", () => {
    expect(
      isSameNotificationContent(
        { type: "agent", title: "작업 완료", body: "초안 생성" },
        { type: "agent", title: "작업 완료", body: "초안 생성" },
      ),
    ).toBe(true);
    expect(
      isSameNotificationContent(
        { type: "agent", title: "작업 완료", body: "초안 생성" },
        { type: "agent", title: "작업 완료", body: "다른 본문" },
      ),
    ).toBe(false);
  });

  it("중복 알림은 새 항목을 추가하지 않고 맨 앞으로 갱신한다", () => {
    const prev: AppNotification[] = [
      {
        id: "a",
        type: "command",
        title: "빌드 완료",
        body: "dist 생성",
        timestamp: 100,
        read: true,
      },
      {
        id: "b",
        type: "agent",
        title: "에이전트 완료",
        body: "리뷰 초안",
        timestamp: 90,
        read: false,
      },
    ];

    expect(
      upsertNotificationList(
        prev,
        { type: "command", title: "빌드 완료", body: "dist 생성" },
        200,
      ),
    ).toEqual([
      {
        id: "a",
        type: "command",
        title: "빌드 완료",
        body: "dist 생성",
        timestamp: 200,
        read: false,
      },
      {
        id: "b",
        type: "agent",
        title: "에이전트 완료",
        body: "리뷰 초안",
        timestamp: 90,
        read: false,
      },
    ]);
  });

  it("새 알림은 앞에 추가되고 읽지 않음 개수 계산에 반영된다", () => {
    const uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000002");
    try {
      const next = upsertNotificationList(
        [
          {
            id: "a",
            type: "env",
            title: "환경 점검",
            body: "문제 없음",
            timestamp: 100,
            read: true,
          },
        ],
        { type: "healing", title: "복구 제안", body: "권한 수정 제안" },
        300,
      );

      expect(next[0]).toEqual({
        id: "00000000-0000-4000-8000-000000000002",
        type: "healing",
        title: "복구 제안",
        body: "권한 수정 제안",
        timestamp: 300,
        read: false,
      });
      expect(getUnreadNotificationCount(next)).toBe(1);
    } finally {
      uuidSpy.mockRestore();
    }
  });
});
