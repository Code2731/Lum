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
});
