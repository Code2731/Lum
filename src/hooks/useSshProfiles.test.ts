import { describe, expect, it } from "vitest";
import { getSshProfilesMeta, type SshProfileEntry } from "./useSshProfiles";

describe("useSshProfiles helpers", () => {
  it("저장된 프로필이 없으면 새 원격 연결 흐름을 안내한다", () => {
    expect(getSshProfilesMeta([])).toEqual({
      title: "저장된 SSH 프로필이 없습니다",
      badges: ["프로필 0개", "키 연결 0개", "새 원격 연결 추가"],
      helper: "호스트, 포트, 사용자 정보를 저장해두면 다음부터는 원격 세션을 더 빠르게 시작할 수 있습니다.",
    });
  });

  it("프로필 수와 키 기반 연결 수를 함께 요약한다", () => {
    const profiles: SshProfileEntry[] = [
      {
        id: "1",
        label: "prod",
        host: "prod.example.com",
        port: 22,
        username: "deploy",
        keyPath: "~/.ssh/prod",
      },
      {
        id: "2",
        label: "staging",
        host: "staging.example.com",
        port: 2222,
        username: "ubuntu",
      },
    ];

    expect(getSshProfilesMeta(profiles)).toEqual({
      title: "SSH 프로필 2개 준비됨",
      badges: ["프로필 2개", "키 연결 1개", "바로 접속 가능"],
      helper: "자주 쓰는 원격 접속 정보를 저장해 두고 현재 터미널에서 바로 세션을 시작할 수 있습니다.",
    });
  });
});
