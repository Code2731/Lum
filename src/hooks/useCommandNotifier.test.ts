import { describe, expect, it } from "vitest";
import {
  getCommandNotificationBadge,
  getCommandNotificationBody,
  getCommandNotificationPreview,
  getCommandNotificationTitle,
} from "./useCommandNotifier";

describe("useCommandNotifier helpers", () => {
  it("성공/실패 상태에 따라 제목과 배지를 구분한다", () => {
    expect(getCommandNotificationBadge(0)).toBe("✅ LUM");
    expect(getCommandNotificationBadge(1)).toBe("❌ LUM");
    expect(getCommandNotificationTitle(0)).toBe("✅ 커맨드 성공");
    expect(getCommandNotificationTitle(2)).toBe("❌ 커맨드 실패");
  });

  it("명령 프리뷰는 trim하고 길면 생략 부호를 붙인다", () => {
    expect(getCommandNotificationPreview("  npm run dev  ")).toBe("npm run dev");
    expect(
      getCommandNotificationPreview("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    ).toBe("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567…");
  });

  it("알림 본문은 성공/실패 상태를 구분해 요약한다", () => {
    expect(getCommandNotificationBody("npm test", 0, 14)).toBe("명령: npm test\n성공 · 14초 소요");
    expect(getCommandNotificationBody("cargo test", 101, 22)).toBe(
      "명령: cargo test\n실패 · 22초 소요 · 종료 코드 101",
    );
  });
});
