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
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTitle("Recall 백엔드 저장");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: "zvec",
      });
    });
  });

  it("지원 목록에 없는 설정값은 active 백엔드로 정규화해서 저장한다", async () => {
    invokeMock.mockReset();
    mockInvokeWith({
      configBackend: "custom-db",
      infoRequestedRaw: "custom-db",
      infoRequested: "local-cosine",
      infoActive: "local-cosine",
      infoSupported: ["local-cosine", "zvec"],
    });
    render(<XllmPanel onClose={vi.fn()} />);

    const saveButton = await screen.findByTitle("Recall 백엔드 저장");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: "local-cosine",
      });
      expect(screen.getByText("원본 요청값:", { exact: false })).toBeInTheDocument();
    });
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

    const saveButton = await screen.findByTitle("Recall 백엔드 저장");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_recall_vector_backend", {
        backend: "zvec",
      });
    });
  });

  it("기본값 버튼 클릭 시 backend null로 저장한다", async () => {
    render(<XllmPanel onClose={vi.fn()} />);

    const resetButton = await screen.findByTitle("Recall 백엔드 기본값 사용");
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

    const resetButton = await screen.findByTitle("Recall 백엔드 기본값 사용");
    expect(resetButton).toBeDisabled();
  });
});
