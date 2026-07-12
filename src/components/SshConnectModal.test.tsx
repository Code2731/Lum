import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SshConnectModal, { getSshConnectFlowSummary } from "./SshConnectModal";

vi.mock("../hooks/useSshProfiles", () => ({
  useSshProfiles: () => ({
    profiles: [
      {
        id: "p1",
        label: "prod",
        host: "prod.example.com",
        port: 22,
        username: "ubuntu",
        keyPath: null,
      },
    ],
    save: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }),
}));

describe("SshConnectModal", () => {
  it("요약 함수는 초기/입력 상태를 반환한다", () => {
    expect(
      getSshConnectFlowSummary({
        profileCount: 1,
        host: "",
        username: "",
        authType: "agent",
      }),
    ).toEqual({
      primary: "SSH 연결 준비",
      secondary: "저장 프로필 1개",
      detail: "저장된 프로필을 고르거나 호스트와 사용자명을 입력해 연결 흐름을 시작할 수 있습니다.",
    });
    expect(
      getSshConnectFlowSummary({
        profileCount: 1,
        host: "prod.example.com",
        username: "ubuntu",
        authType: "key",
      }),
    ).toEqual({
      primary: "접속 정보 확인",
      secondary: "ubuntu@prod.example.com · 키 파일",
      detail: "호스트, 사용자명, 인증 방식을 확인한 뒤 바로 SSH 연결을 시도할 수 있습니다.",
    });
  });

  it("SSH 연결 흐름 안내를 보여준다", () => {
    render(
      <SshConnectModal
        onConnect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("SSH 연결 준비")).toBeInTheDocument();
    expect(screen.getByText("저장 프로필 1개")).toBeInTheDocument();
    expect(screen.getByText("마지막 연결")).toBeInTheDocument();
    expect(
      screen.getByText("저장된 프로필을 고르거나 호스트와 사용자명을 입력해 연결 흐름을 시작할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("저장된 연결")).toBeInTheDocument();
    expect(screen.getByText("한 번 클릭 채우기")).toBeInTheDocument();
    expect(screen.getByText("필요 시 삭제")).toBeInTheDocument();
  });
});
