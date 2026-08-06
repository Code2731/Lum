import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MarkdownViewerPanel, { getMarkdownViewerFlowSummary } from "./MarkdownViewerPanel";

type WriteSpy = ReturnType<typeof vi.fn>;
type RestoreSpy = ReturnType<typeof vi.spyOn>;

function setupClipboardWriteMock() {
  const writeText = vi.fn().mockResolvedValue(undefined) as WriteSpy;
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;

  if (originalClipboard) {
    return {
      writeText,
      restore: vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined) as RestoreSpy,
    };
  }

  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  return {
    writeText,
    restore: null as RestoreSpy | null,
  };
}

describe("MarkdownViewerPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("문서 뷰어 흐름 안내를 보여준다", () => {
    render(
      <MarkdownViewerPanel
        path="/tmp/doc.md"
        title="문서"
        content="# 제목"
        loading={false}
        error={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("문서 미리보기 준비")).toBeInTheDocument();
    expect(screen.getAllByText("문서").length).toBeGreaterThan(0);
    expect(screen.getByText("마지막 복사·닫기")).toBeInTheDocument();
    expect(
      screen.getByText("문서 제목과 경로를 확인한 뒤 본문을 읽고 필요한 정보만 복사할 수 있습니다."),
    ).toBeInTheDocument();
  });

  it("요약 함수는 로딩/오류/빈 문서 상태를 반환한다", () => {
    expect(
      getMarkdownViewerFlowSummary({
        title: "문서",
        path: "/tmp/doc.md",
        content: "# 제목",
        loading: true,
        error: null,
      }),
    ).toEqual({
      primary: "문서 로드 중",
      secondary: "/tmp/doc.md",
      detail: "파일 내용을 읽어 마크다운 미리보기를 준비하고 있습니다.",
    });

    expect(
      getMarkdownViewerFlowSummary({
        title: "문서",
        path: "/tmp/doc.md",
        content: "",
        loading: false,
        error: "문서를 열 수 없습니다",
      }),
    ).toEqual({
      primary: "문서 열기 실패",
      secondary: "/tmp/doc.md",
      detail: "문서를 열 수 없습니다",
    });

    expect(
      getMarkdownViewerFlowSummary({
        title: "",
        path: "",
        content: "   ",
        loading: false,
        error: null,
      }),
    ).toEqual({
      primary: "빈 문서 미리보기",
      secondary: "로컬 문서",
      detail: "표시할 본문이 없어 제목과 경로만 확인할 수 있습니다.",
    });
  });

  it("에러 메시지를 복사할 수 있다", () => {
    const clipboardMock = setupClipboardWriteMock();

    render(
      <MarkdownViewerPanel
        path="/tmp/doc.md"
        title="문서"
        content="# 제목"
        loading={false}
        error="문서를 열 수 없습니다"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText("문서를 열 수 없습니다").length).toBeGreaterThan(0);

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("문서를 열 수 없습니다");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("문서를 열 수 없습니다");
    }
  });
});
