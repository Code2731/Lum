import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import XllmPanel from "./XllmPanel";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

function mockInvoke() {
  mockInvokeWith({});
}

function mockInvokeWith(overrides: {
  configBackend?: string | null;
  infoRequested?: string | null;
  infoRequestedRaw?: string | null;
  infoActive?: string | null;
  infoSupported?: string[];
  infoRequestedAdjusted?: boolean;
  infoActiveMatchesRequested?: boolean;
}) {
  const configBackend = overrides.configBackend === undefined ? "zvec" : overrides.configBackend;
  const infoRequested = overrides.infoRequested === undefined ? "zvec" : overrides.infoRequested;
  const infoRequestedRaw = overrides.infoRequestedRaw === undefined ? infoRequested : overrides.infoRequestedRaw;
  const infoActive = overrides.infoActive === undefined ? "local-cosine" : overrides.infoActive;
  const infoSupported = overrides.infoSupported ?? ["local-cosine", "zvec"];
  const infoRequestedAdjusted =
    overrides.infoRequestedAdjusted ?? infoRequestedRaw !== infoRequested;
  const infoActiveMatchesRequested =
    overrides.infoActiveMatchesRequested ?? infoRequested === infoActive;
  invokeMock.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd === "load_app_config") {
      return Promise.resolve(
        configBackend === null
          ? {}
          : {
              recall_vector_backend: configBackend,
            },
      );
    }
    if (cmd === "recall_backend_info") {
      return Promise.resolve({
        requested_raw: infoRequestedRaw,
        requested: infoRequested,
        active: infoActive,
        supported: infoSupported,
        requested_adjusted: infoRequestedAdjusted,
        active_matches_requested: infoActiveMatchesRequested,
      });
    }
    if (cmd === "save_recall_vector_backend") {
      return Promise.resolve(args ?? {});
    }
    if (cmd === "list_embed_candidates") {
      return Promise.resolve([]);
    }
    if (cmd === "list_lora_candidates") {
      return Promise.resolve([]);
    }
    if (cmd === "embed_loaded_info") {
      return Promise.resolve(null);
    }
    if (cmd === "save_xllm_settings") {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

describe("XllmPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    mockInvoke();
  });

  it("Recall 백엔드 섹션에서 active 상태를 표시한다", async () => {
    render(<XllmPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("recall_backend_info", undefined);
      expect(screen.getByText("active: local-cosine")).toBeInTheDocument();
    });
  });

  it("상단 설정 저장 실패 시 객체 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_xllm_settings") return Promise.reject({ message: "설정 저장 API 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "설정 저장" });
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: 설정 저장 API 오류")).toBeInTheDocument();
  });

  it("상단 설정 저장 실패 시 message 없는 객체 오류는 기본 문구로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_xllm_settings") return Promise.reject({});
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "설정 저장" });
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: 알 수 없는 오류")).toBeInTheDocument();
  });

  it("상단 설정 저장 실패 시 공백 message 객체 오류도 기본 문구로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_xllm_settings") return Promise.reject({ message: "   " });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "설정 저장" });
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: 알 수 없는 오류")).toBeInTheDocument();
  });

  it("상단 설정 저장 실패 시 숫자 오류를 문자열로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_xllm_settings") return Promise.reject(503);
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "설정 저장" });
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: 503")).toBeInTheDocument();
  });

  it("상단 설정 저장 실패 시 boolean 오류를 문자열로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_xllm_settings") return Promise.reject(false);
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "설정 저장" });
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: false")).toBeInTheDocument();
  });

  it("상단 설정 저장 실패 시 빈 Error.message는 기본 문구로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_xllm_settings") return Promise.reject(new Error("   "));
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "설정 저장" });
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: 알 수 없는 오류")).toBeInTheDocument();
  });

  it("Recall 백엔드 저장 클릭 시 save_recall_vector_backend를 호출한다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "zvec",
      infoRequestedRaw: null,
      infoRequested: null,
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: "zvec",
      });
    });
  });

  it("local-cosine 선택이 변경 상태일 때 저장하면 backend null로 보낸다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "local-cosine",
      infoRequestedRaw: "zvec",
      infoRequested: "zvec",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: false,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: null,
      });
    });
  });

  it("지원 목록에 없는 설정값이 local-cosine으로 정규화되면 저장 버튼이 비활성화된다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "custom-db",
      infoRequestedRaw: "custom-db",
      infoRequested: "local-cosine",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
    expect(screen.getByTestId("recall-backend-warning")).toBeInTheDocument();
  });

  it("active/fallback도 지원 목록에 없으면 첫 supported 값으로 저장한다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "custom-db",
      infoRequestedRaw: "custom-db",
      infoRequested: "local-cosine",
      infoActive: "custom-active",
      infoSupported: ["zvec"],
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: "zvec",
      });
    });
  });

  it("기본값 버튼 클릭 시 backend null로 저장한다", async () => {
    render(<XllmPanel onClose={vi.fn()} />);

    const resetButton = await screen.findByTestId("recall-backend-reset");
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: null,
      });
    });
  });

  it("이미 기본값 상태면 기본값 버튼이 비활성화된다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: null,
      infoRequestedRaw: null,
      infoRequested: null,
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const resetButton = await screen.findByTestId("recall-backend-reset");
    expect(resetButton).toBeDisabled();
  });

  it("비활성화된 기본값 버튼 클릭은 save_recall_vector_backend를 호출하지 않는다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: null,
      infoRequestedRaw: null,
      infoRequested: null,
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const resetButton = await screen.findByTestId("recall-backend-reset");
    expect(resetButton).toBeDisabled();
    fireEvent.click(resetButton);

    const saveCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "save_recall_vector_backend",
    );
    expect(saveCalls.length).toBe(0);
  });

  it("이미 기본값 상태면 저장 버튼도 비활성화된다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: null,
      infoRequestedRaw: null,
      infoRequested: null,
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
  });

  it("비활성화된 저장 버튼 클릭은 save_recall_vector_backend를 호출하지 않는다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: null,
      infoRequestedRaw: null,
      infoRequested: null,
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    const saveCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "save_recall_vector_backend",
    );
    expect(saveCalls.length).toBe(0);
  });

  it("이미 zvec 상태면 저장 버튼이 비활성화된다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "zvec",
      infoRequestedRaw: "zvec",
      infoRequested: "zvec",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: false,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
  });

  it("supported 목록에 공백이 섞여도 zvec 키를 정규화해 저장 noop을 유지한다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "zvec",
      infoRequestedRaw: "zvec",
      infoRequested: "zvec",
      infoActive: "local-cosine",
      infoSupported: ["  zvec  "],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: false,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
  });

  it("supported 목록이 대소문자/alias여도 정규화해 zvec 저장 noop을 유지한다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "ZVEC",
      infoRequestedRaw: "zvec",
      infoRequested: "zvec",
      infoActive: "local-cosine",
      infoSupported: ["  Z-VEC  ", "LOCAL_COSINE", "localcosine"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: false,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
  });

  it("legacy local-cosine raw 상태도 저장 버튼이 비활성화된다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "local-cosine",
      infoRequestedRaw: "local-cosine",
      infoRequested: "local-cosine",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    expect(saveButton).toBeDisabled();
  });

  it("legacy local-cosine raw 상태에서는 기본값 버튼으로 override 제거가 가능하다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "local-cosine",
      infoRequestedRaw: "local-cosine",
      infoRequested: "local-cosine",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const resetButton = await screen.findByTestId("recall-backend-reset");
    expect(resetButton).toBeEnabled();
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: null,
      });
    });
  });

  it("legacy LOCAL_COSINE raw 상태도 저장은 비활성화되고 기본값으로 override 제거가 가능하다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: " LOCAL_COSINE ",
      infoRequestedRaw: " LOCAL_COSINE ",
      infoRequested: "local-cosine",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: true,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    const resetButton = await screen.findByTestId("recall-backend-reset");
    expect(saveButton).toBeDisabled();
    expect(resetButton).toBeEnabled();

    fireEvent.click(resetButton);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: null,
      });
    });
  });

  it("custom-db 정규화 상태에서는 저장은 비활성화되지만 기본값으로 override 제거는 가능하다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "custom-db",
      infoRequestedRaw: "custom-db",
      infoRequested: "local-cosine",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: true,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    const resetButton = await screen.findByTestId("recall-backend-reset");
    expect(saveButton).toBeDisabled();
    expect(resetButton).toBeEnabled();

    fireEvent.click(resetButton);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: null,
      });
    });
  });

  it("정상 기본 상태에서는 경고 배너가 표시되지 않는다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: null,
      infoRequestedRaw: null,
      infoRequested: null,
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
      infoRequestedAdjusted: false,
      infoActiveMatchesRequested: true,
    });
    render(<XllmPanel onClose={vi.fn()} />);

    await screen.findByTestId("recall-backend-save");
    expect(screen.queryByTestId("recall-backend-warning")).toBeNull();
  });

  it("새로고침 버튼 클릭 시 recall_backend_info를 다시 호출한다", async () => {
    render(<XllmPanel onClose={vi.fn()} />);

    await screen.findByTestId("recall-backend-save");
    const initialCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "recall_backend_info",
    ).length;

    const refreshButton = screen.getByTestId("recall-backend-refresh");
    fireEvent.click(refreshButton);

    await waitFor(() => {
      const afterCalls = invokeMock.mock.calls.filter(
        (c) => c[0] === "recall_backend_info",
      ).length;
      expect(afterCalls).toBeGreaterThan(initialCalls);
    });
  });

  it("recall backend 상태 조회 실패 시 원인 메시지를 표시하고 저장 액션은 비활성화된다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") return Promise.reject({ message: "조회 API 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    expect(await screen.findByText("상태 조회 실패: 조회 API 오류")).toBeInTheDocument();
    expect(screen.getByTestId("recall-backend-save")).toBeDisabled();
    expect(screen.getByTestId("recall-backend-reset")).toBeDisabled();
  });

  it("recall backend 상태 조회 실패 시 message 없는 객체 오류는 기본 문구로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") return Promise.reject({});
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    expect(await screen.findByText("상태 조회 실패: 알 수 없는 오류")).toBeInTheDocument();
    expect(screen.getByTestId("recall-backend-save")).toBeDisabled();
    expect(screen.getByTestId("recall-backend-reset")).toBeDisabled();
  });

  it("recall backend 저장 실패 시 객체 오류도 메시지 문자열로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          recall_vector_backend: "zvec",
        });
      }
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "save_recall_vector_backend") {
        return Promise.reject({ message: "저장 API 오류" });
      }
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve(args ?? {});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTestId("recall-backend-save");
    fireEvent.click(saveButton);

    expect(await screen.findByText("저장 실패: 저장 API 오류")).toBeInTheDocument();
  });

  it("recall backend 기본값 복원 실패 시 객체 오류도 메시지 문자열로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          recall_vector_backend: "zvec",
        });
      }
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: "zvec",
          requested: "zvec",
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: false,
        });
      }
      if (cmd === "save_recall_vector_backend") {
        return Promise.reject({ message: "기본값 저장 오류" });
      }
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve(args ?? {});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const resetButton = await screen.findByTestId("recall-backend-reset");
    fireEvent.click(resetButton);

    expect(await screen.findByText("기본값 복원 실패: 기본값 저장 오류")).toBeInTheDocument();
  });

  it("LAN 검색 실패 시 객체 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "discover_lan_llm_servers") return Promise.reject({ message: "LAN 탐색 API 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const discoverButton = await screen.findByRole("button", { name: "검색" });
    fireEvent.click(discoverButton);

    expect(await screen.findByText("검색 실패: LAN 탐색 API 오류")).toBeInTheDocument();
  });

  it("LAN 검색 실패 시 문자열 오류를 그대로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "discover_lan_llm_servers") return Promise.reject("LAN 타임아웃");
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const discoverButton = await screen.findByRole("button", { name: "검색" });
    fireEvent.click(discoverButton);

    expect(await screen.findByText("검색 실패: LAN 타임아웃")).toBeInTheDocument();
  });

  it("LAN 서버 적용 실패 시 객체 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "discover_lan_llm_servers") {
        return Promise.resolve([{
          ip: "127.0.0.2",
          port: 1234,
          kind: "open_ai_compat",
          url: "http://127.0.0.2:1234",
          models: ["qwen2.5-coder-7b"],
          latency_ms: 12,
        }]);
      }
      if (cmd === "save_xllm_base_url") return Promise.reject({ message: "백엔드 적용 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const discoverButton = await screen.findByRole("button", { name: "검색" });
    fireEvent.click(discoverButton);
    const applyButton = await screen.findByRole("button", { name: "사용" });
    fireEvent.click(applyButton);

    expect(await screen.findByText("적용 실패: 백엔드 적용 오류")).toBeInTheDocument();
  });

  it("LAN 서버 적용 실패 시 message 없는 객체 오류는 기본 문구로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "discover_lan_llm_servers") {
        return Promise.resolve([{
          ip: "127.0.0.3",
          port: 8080,
          kind: "open_ai_compat",
          url: "http://127.0.0.3:8080",
          models: ["qwen2.5-coder-7b"],
          latency_ms: 21,
        }]);
      }
      if (cmd === "save_xllm_base_url") return Promise.reject({});
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const discoverButton = await screen.findByRole("button", { name: "검색" });
    fireEvent.click(discoverButton);
    const applyButton = await screen.findByRole("button", { name: "사용" });
    fireEvent.click(applyButton);

    expect(await screen.findByText("적용 실패: 알 수 없는 오류")).toBeInTheDocument();
  });

  it("LAN 서버 적용 실패 시 문자열 오류를 그대로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "discover_lan_llm_servers") {
        return Promise.resolve([{
          ip: "127.0.0.4",
          port: 5000,
          kind: "open_ai_compat",
          url: "http://127.0.0.4:5000",
          models: ["qwen2.5-coder-7b"],
          latency_ms: 17,
        }]);
      }
      if (cmd === "save_xllm_base_url") return Promise.reject("LAN 적용 타임아웃");
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const discoverButton = await screen.findByRole("button", { name: "검색" });
    fireEvent.click(discoverButton);
    const applyButton = await screen.findByRole("button", { name: "사용" });
    fireEvent.click(applyButton);

    expect(await screen.findByText("적용 실패: LAN 적용 타임아웃")).toBeInTheDocument();
  });

  it("임베디드 추론 실패 시 객체 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "embed_loaded_info") return Promise.resolve("/tmp/test/model.gguf");
      if (cmd === "embed_infer_stream") return Promise.reject({ message: "임베디드 추론 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const promptInput = await screen.findByPlaceholderText("Hello, world!");
    fireEvent.change(promptInput, { target: { value: "안녕" } });

    const inferButton = await screen.findByRole("button", { name: /임베디드 추론/ });
    fireEvent.click(inferButton);

    expect(await screen.findByText("❌ 임베디드 추론 오류")).toBeInTheDocument();
  });

  it("임베디드 로드 실패 시 객체 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      if (cmd === "list_embed_candidates") {
        return Promise.resolve([{
          folder: "/tmp/models/qwen",
          folder_label: "qwen",
          gguf_files: ["qwen.gguf"],
          has_safetensors: false,
        }]);
      }
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_load_gguf") return Promise.reject({ message: "모델 로드 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const loadButton = await screen.findByRole("button", { name: /임베디드 로드|교체|재로드/ });
    fireEvent.click(loadButton);

    expect(await screen.findByText("❌ 모델 로드 오류")).toBeInTheDocument();
  });

  it("임베디드 로드 실패 시 Error 인스턴스 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "embed_loaded_info") return Promise.resolve(null);
      if (cmd === "list_embed_candidates") {
        return Promise.resolve([{
          folder: "/tmp/models/qwen",
          folder_label: "qwen",
          gguf_files: ["qwen.gguf"],
          has_safetensors: false,
        }]);
      }
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_load_gguf") return Promise.reject(new Error("모델 로드 예외"));
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve({});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const loadButton = await screen.findByRole("button", { name: /임베디드 로드|교체|재로드/ });
    fireEvent.click(loadButton);

    expect(await screen.findByText("❌ 모델 로드 예외")).toBeInTheDocument();
  });

  it("임베디드 언로드 실패 시 객체 오류를 사람이 읽을 수 있는 메시지로 노출한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "recall_backend_info") {
        return Promise.resolve({
          requested_raw: null,
          requested: null,
          active: "local-cosine",
          supported: ["local-cosine", "zvec"],
          requested_adjusted: false,
          active_matches_requested: true,
        });
      }
      if (cmd === "embed_loaded_info") return Promise.resolve("/tmp/test/model.gguf");
      if (cmd === "list_embed_candidates") return Promise.resolve([]);
      if (cmd === "list_lora_candidates") return Promise.resolve([]);
      if (cmd === "embed_unload") return Promise.reject({ message: "모델 언로드 오류" });
      if (cmd === "save_recall_vector_backend") return Promise.resolve(args ?? {});
      if (cmd === "save_xllm_settings") return Promise.resolve({});
      return Promise.resolve(args ?? {});
    });

    render(<XllmPanel onClose={vi.fn()} />);

    const unloadText = await screen.findByText("🗑 언로드");
    const unloadButton = unloadText.closest("button");
    expect(unloadButton).not.toBeNull();
    if (unloadButton) fireEvent.click(unloadButton);

    expect(await screen.findByText("❌ 모델 언로드 오류")).toBeInTheDocument();
  });
});
