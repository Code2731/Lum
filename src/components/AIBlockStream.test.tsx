import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AIBlockStream, {
  getAIBlockStreamErrorMeta,
  getAIBlockStreamHeaderMeta,
} from "./AIBlockStream";
import type { ChatMessage } from "../hooks/useAIChat";

const msg = (role: "user" | "assistant", content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: Date.now(),
});

describe("AIBlockStream", () => {
  it("헤더 메타는 메시지 수와 스트리밍 상태를 함께 요약한다", () => {
    expect(getAIBlockStreamHeaderMeta(2, false)).toEqual({
      ariaLabel: "AI 대화 헤더 · 메시지 2개",
      title: "AI 대화",
      countLabel: "2개 메시지",
      streamingLabel: null,
    });
    expect(getAIBlockStreamHeaderMeta(3, true)).toEqual({
      ariaLabel: "AI 대화 헤더 · 메시지 3개 · 응답 생성 중",
      title: "AI 대화",
      countLabel: "3개 메시지",
      streamingLabel: "응답 생성 중",
    });
  });

  it("에러 메타는 라우팅 오류 여부에 따라 배너 라벨을 구분한다", () => {
    expect(getAIBlockStreamErrorMeta("라우팅 실패", true).ariaLabel).toBe("라우팅 오류 배너 · 라우팅 실패");
    expect(getAIBlockStreamErrorMeta("임시 에러", false).ariaLabel).toBe("AI 오류 배너 · 임시 에러");
  });

  it("메시지 없고 에러 없으면 렌더링 안 됨", () => {
    const { container } = render(
      <AIBlockStream messages={[]} streaming={false} error={null} onClear={vi.fn()} onExecute={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("에러만 있어도 렌더링", () => {
    render(
      <AIBlockStream
        messages={[]}
        streaming={false}
        error="Network error"
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("라우팅 에러이면 xLLM 설정 버튼 표시", () => {
    const onOpenXllmPanel = vi.fn();
    render(
      <AIBlockStream
        messages={[]}
        streaming={false}
        error="라우팅 실패: 임베디드 모델이 로드되지 않았습니다"
        onClear={vi.fn()}
        onOpenXllmPanel={onOpenXllmPanel}
        onExecute={vi.fn()}
      />,
    );
    const openButton = screen.getByLabelText("xLLM/모델 설정 열기");
    fireEvent.click(openButton);
    expect(onOpenXllmPanel).toHaveBeenCalledTimes(1);
  });

  it("에러 배너에서 복사 버튼으로 텍스트를 클립보드에 복사", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = (globalThis.navigator as Navigator & { clipboard?: { writeText: typeof writeText } }).clipboard;
    let spyWriteText: ReturnType<typeof vi.fn> | null = null;
    if (originalClipboard) {
      spyWriteText = vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined);
    } else {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
    }

    render(
      <AIBlockStream
        messages={[]}
        streaming={false}
        error="임시 에러"
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("오류 텍스트 복사"));
    if (spyWriteText) {
      expect(spyWriteText).toHaveBeenCalledWith("임시 에러");
    } else {
      expect(writeText).toHaveBeenCalledWith("임시 에러");
    }
  });

  it("메시지 카운트 배지 표시", () => {
    render(
      <AIBlockStream
        messages={[msg("user", "안녕"), msg("assistant", "안녕하세요")]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByText(/2개 메시지/)).toBeInTheDocument();
    expect(screen.getByLabelText("AI 대화 헤더 · 메시지 2개")).toBeInTheDocument();
  });

  it("사용자 메시지와 AI 답변 모두 렌더링", () => {
    render(
      <AIBlockStream
        messages={[msg("user", "파일 개수 세줘"), msg("assistant", "현재 디렉토리에 2개입니다.")]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByText("파일 개수 세줘")).toBeInTheDocument();
    expect(screen.getByText(/2개입니다/)).toBeInTheDocument();
  });

  it("X 버튼 클릭 → onClear 호출", () => {
    const onClear = vi.fn();
    render(
      <AIBlockStream
        messages={[msg("user", "안녕")]}
        streaming={false}
        error={null}
        onClear={onClear}
        onExecute={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("대화 지우기"));
    expect(onClear).toHaveBeenCalled();
  });

  it("스트리밍 중엔 로더 아이콘 표시", () => {
    const { container } = render(
      <AIBlockStream
        messages={[msg("user", "hi")]}
        streaming={true}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    // lucide Loader2는 animate-spin 클래스로 식별
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("스트리밍 중 응답 중지 버튼 → onCancel 호출", () => {
    const onCancel = vi.fn();
    render(
      <AIBlockStream
        messages={[msg("user", "hi")]}
        streaming={true}
        error={null}
        onClear={vi.fn()}
        onCancel={onCancel}
        onExecute={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("응답 중지"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("Mermaid 코드블록도 텍스트로 보존된다", () => {
    const mermaidMessage = "query_graph 결과:\n```mermaid\nflowchart LR\n\"service.rs\" --> \"db.rs\"\n```";
    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const summary = container.querySelector("ul");
    expect(summary).not.toBeNull();
    expect(container).toHaveTextContent("Mermaid 텍스트 다이어그램");
    expect(container).toHaveTextContent("\"service.rs\" --> \"db.rs\"");
  });

  it("Mermaid 엣지 라벨을 포함해 중복 없이 보존한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"service.rs\" --> \"db.rs\"",
      "\"service.rs\" --> \"db.rs\"",
      "\"service.rs\" -->|calls| \"db.rs\"",
      "```",
    ].join("\n");
    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines.length).toBe(2);
    expect(lines[0]).toHaveTextContent("\"service.rs\" --> \"db.rs\"");
    expect(lines[1]).toHaveTextContent("\"service.rs\" --> \"db.rs\" (calls)");
  });

  it("Mermaid 화살표 타입을 보존해 표시한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"service.rs\" -.-> \"db.rs\"",
      "\"service.rs\" -->> \"audit.rs\"",
      "\"service.rs\" -.-> \"db.rs\"",
      "%% comment",
      "classDef C fill:#f96",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines.length).toBe(2);
    expect(lines[0]).toHaveTextContent('"service.rs" -.-> "db.rs"');
    expect(lines[1]).toHaveTextContent('"service.rs" -->> "audit.rs"');
  });

  it("Mermaid 역방향 화살표도 텍스트로 보여준다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"reader.rs\" <-- \"parser.rs\"",
      "\"reader.rs\" <-.->|calls| \"scanner.rs\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('"reader.rs" <-- "parser.rs"');
    expect(lines[1]).toHaveTextContent('"reader.rs" <-.-> "scanner.rs" (calls)');
  });

  it("Mermaid 엣지 주석은 렌더링 시 무시된다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"service.rs\" --> \"db.rs\" %% inline comment",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('"service.rs" --> "db.rs"');
  });

  it("공백 없이 붙은 mermaid 주석도 unquoted 노드에서 제거한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "service --> db.rs%% inline comment",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe("service --> db.rs");
  });

  it("라벨 내부의 %%는 공백이 있어도 주석으로 인식되지 않는다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"api\" -->|cache%% only| \"storage\"",
      "\"api\" -->|path%% and| \"storage\" %% inline comment",
      "\"api\" -->|path\\\\%% only| \"storage\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveTextContent('"api" --> "storage" (cache%% only)');
    expect(lines[1]).toHaveTextContent('"api" --> "storage" (path%% and)');
    expect(lines[2]).toHaveTextContent('"api" --> "storage" (path\\%% only)');
  });

  it("ID 내의 %%는 mermaid 주석으로 잘못 인식되지 않는다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"service%%.rs\" --> db",
      "A %% B",
      "A --> B%%_id",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('"service%%.rs" --> db');
    expect(lines[1]).toHaveTextContent('A --> B%%_id');
  });

  it("단일 따옴표 노드와 라벨의 %%는 주석 처리되지 않는다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "'service' --> 'db.rs'",
      "'cache' -->|cache%%only| 'backend.rs'",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent("'service' --> 'db.rs'");
    expect(lines[1]).toHaveTextContent("'cache' --> 'backend.rs' (cache%%only)");
  });

  it("단일 따옴표 노드 뒤에 바로 붙은 mermaid 주석을 제거한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "'service' --> 'db.rs'%% inline comment",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent("'service' --> 'db.rs'");
  });

  it("Mermaid 더블 대시 엣지도 텍스트로 보존한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"cli\" --- \"parser\"",
      "\"cli\" ---|calls|\"backend\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('"cli" --- "parser"');
    expect(lines[1]).toHaveTextContent('"cli" --- "backend" (calls)');
  });

  it("Mermaid 희소 화살표(<-.->, <==)도 텍스트로 보존한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"engine\" <-.-> \"frontend\"",
      "\"frontend\" <== \"backend\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('"engine" <-.-> "frontend"');
    expect(lines[1]).toHaveTextContent('"frontend" <== "backend"');
  });

  it("Mermaid 양방향 기본 화살표(<->)도 텍스트로 보존한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"web\" <-> \"api\"",
      "\"cache\" <->|cache hit| \"db\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('"web" <-> "api"');
    expect(lines[1]).toHaveTextContent('"cache" <-> "db" (cache hit)');
  });

  it("노드명에 %%가 있어도 주석으로 제거하지 않는다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"service%%.rs\" --> \"db.rs\"",
      "\"cache\" -->|reads%%only| \"db.rs\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('"service%%.rs" --> "db.rs"');
    expect(lines[1]).toHaveTextContent('"cache" --> "db.rs" (reads%%only)');
  });

  it("노드 뒤에 바로 붙은 mermaid 주석도 제거한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"service\" --> \"db.rs\"%% inline comment",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('"service" --> "db.rs"');
  });

  it("이스케이프된 %%는 라벨 보존, 실제 주석은 제거된다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"backend\" -->|safe\\%%path| \"db.rs\"%% inline comment",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('"backend" --> "db.rs" (safe%%path)');
  });

  it("라벨의 이스케이프된 | 문자도 정확히 표시한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"cache\" -->|cache\\|db| \"db.rs\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('"cache" --> "db.rs" (cache|db)');
  });

  it("Mermaid 모서리 형태 o/x 조합도 텍스트로 보존한다", () => {
    const mermaidMessage = [
      "query_graph 결과:",
      "```mermaid",
      "flowchart LR",
      "\"cli\" --o \"engine\"",
      "\"engine\" o--o \"cache\"",
      "\"cache\" x--x \"disk\"",
      "\"disk\" --x \"backend\"",
      "\"backend\" x-- \"final\"",
      "\"final\" --o|hot| \"ui\"",
      "\"ui\" o--o|pipe|\"db\"",
      "\"db\" <-o \"legacy\"",
      "\"legacy\" o<-|old| \"oldest\"",
      "```",
    ].join("\n");

    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    const lines = container.querySelectorAll("li");
    expect(lines).toHaveLength(9);
    expect(lines[0]).toHaveTextContent('"cli" --o "engine"');
    expect(lines[1]).toHaveTextContent('"engine" o--o "cache"');
    expect(lines[2]).toHaveTextContent('"cache" x--x "disk"');
    expect(lines[3]).toHaveTextContent('"disk" --x "backend"');
    expect(lines[4]).toHaveTextContent('"backend" x-- "final"');
    expect(lines[5]).toHaveTextContent('"final" --o "ui" (hot)');
    expect(lines[6]).toHaveTextContent('"ui" o--o "db" (pipe)');
    expect(lines[7]).toHaveTextContent('"db" <-o "legacy"');
    expect(lines[8]).toHaveTextContent('"legacy" o<- "oldest" (old)');
  });

  it("Mermaid 코드블록 엣지 없음 시 일반 코드 블록으로 보존된다", () => {
    const mermaidMessage = "query_graph 결과:\n```mermaid\nflowchart LR\nclassDef C fill:#f96\n```";
    const { container } = render(
      <AIBlockStream
        messages={[msg("assistant", mermaidMessage)]}
        streaming={false}
        error={null}
        onClear={vi.fn()}
        onExecute={vi.fn()}
      />,
    );

    expect(container.querySelector("ul")).toBeNull();
    expect(container).toHaveTextContent("classDef C fill:#f96");
    expect(container.querySelector("pre")).toBeTruthy();
  });
});
