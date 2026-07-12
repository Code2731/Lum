import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Eye, FileText, FileWarning, X, Copy } from "lucide-react";
import { SMALL_ICON_SIZE } from "../constants/ui";
import { IconButton } from "@/components/ui/icon-button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface Props {
  path: string;
  title: string;
  content: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export interface MarkdownViewerFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

function normalizeSourcePath(path: string): string {
  if (path === "") return "로컬 문서";
  return path
    .replace(/\\/g, "/")
    .replace(/(^|\/)(\.\/)?/, "")
    .replace(/^~\//, "~/");
}

export function getMarkdownViewerFlowSummary(input: {
  title: string;
  path: string;
  content: string;
  loading: boolean;
  error: string | null;
}): MarkdownViewerFlowSummary {
  const normalizedPath = normalizeSourcePath(input.path);
  if (input.loading) {
    return {
      primary: "문서 로드 중",
      secondary: normalizedPath,
      detail: "파일 내용을 읽어 마크다운 미리보기를 준비하고 있습니다.",
    };
  }

  if (input.error) {
    return {
      primary: "문서 열기 실패",
      secondary: normalizedPath,
      detail: input.error,
    };
  }

  const hasContent = input.content.trim().length > 0;
  return {
    primary: hasContent ? "문서 미리보기 준비" : "빈 문서 미리보기",
    secondary: input.title || normalizedPath,
    detail: hasContent
      ? "문서 제목과 경로를 확인한 뒤 본문을 읽고 필요한 정보만 복사할 수 있습니다."
      : "표시할 본문이 없어 제목과 경로만 확인할 수 있습니다.",
  };
}

const MarkdownViewerPanel: React.FC<Props> = ({ path, title, content, loading, error, onClose }) => {
  const normalizedPath = useMemo(() => normalizeSourcePath(path), [path]);
  const flowSummary = useMemo(
    () => getMarkdownViewerFlowSummary({ path, title, content, loading, error }),
    [path, title, content, loading, error],
  );
  const copyText = (text: string) => {
    navigator.clipboard?.writeText?.(text).catch(() => {});
  };

  return (
    <div className="lum-markdown-viewer flex flex-col h-full border-l border-white/10 bg-[#0d1117]/95 min-w-[320px] max-w-[480px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        <Eye size={SMALL_ICON_SIZE} className="text-cyan-300 shrink-0" />
        <span className="text-sm font-semibold text-white/85 truncate" title={title}>
          {title}
        </span>
        <button
          onClick={onClose}
          aria-label="문서 미리보기 닫기"
          className="ml-auto p-1 rounded border border-white/[0.1] hover:bg-white/[0.08] text-white/45 hover:text-white/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-xs text-white/45 font-mono truncate" title={normalizedPath}>
        <FileText size={11} className="inline-block mr-1 align-[-1px] text-white/40" />
        {normalizedPath}
      </div>

      <div className="px-3 py-2 border-b border-white/10 bg-white/[0.015]">
        <ActionFlowBar
          badges={[flowSummary.primary, flowSummary.secondary, "마지막 복사·닫기"]}
          helper={flowSummary.detail}
        />
      </div>

      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <ActionFlowBar
                badges={["문서 로드 중", normalizedPath, "읽기 대기"]}
                helper="파일 내용을 읽어 마크다운으로 렌더링하는 중이며, 완료되면 바로 본문을 확인할 수 있습니다."
              />
            </div>
            <div className="text-xs text-white/45">마크다운 문서를 읽고 있습니다…</div>
          </div>
        ) : error ? (
          <div className="flex items-start gap-1.5 p-2 rounded-md border border-red-500/30 bg-red-500/12 text-red-200 text-xs">
            <FileWarning size={12} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed flex-1">{error}</p>
            <IconButton
              tooltip="오류 텍스트 복사"
              onClick={() => copyText(error)}
              className="p-1 rounded text-white/65 hover:text-white hover:bg-red-500/20 transition-colors shrink-0"
            >
              <Copy size={11} />
            </IconButton>
          </div>
        ) : (
          <article className="lum-markdown-doc prose prose-invert max-w-none text-sm text-white/84 leading-relaxed">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="mt-0 mb-2 text-base font-semibold text-white">{children}</h1>,
                h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-sm font-semibold text-cyan-100">{children}</h2>,
                h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-semibold text-white">{children}</h3>,
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="pl-4 list-disc space-y-1 mb-2 marker:text-cyan-200">{children}</ul>,
                ol: ({ children }) => <ol className="pl-4 list-decimal space-y-1 mb-2 marker:text-cyan-200">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-cyan-300/60 pl-2 my-2 text-white/64 italic">{children}</blockquote>
                ),
                code: ({
                  inline,
                  children,
                  className,
                }: React.ComponentPropsWithoutRef<"code"> & {
                  inline?: boolean;
                  className?: string;
                }) => {
                  if (inline || !className?.startsWith("language-")) {
                    return <code className="px-1 py-0.5 rounded bg-white/12 text-xs font-mono text-cyan-100">{children}</code>;
                  }
                  const code = String(children)
                    .replace(/^\n/, "")
                    .replace(/\n$/, "");
                  return (
                    <pre className="mb-3 mt-2 rounded-md border border-white/12 bg-white/4 p-2 overflow-x-auto">
                      <code className="text-xs font-mono text-white/75 whitespace-pre-wrap">{code}</code>
                    </pre>
                  );
                },
                pre: ({ children }) => <>{children}</>,
                a: ({ href, children }) => {
                  if (!href) {
                    return <span>{children}</span>;
                  }
                  return (
                    <a
                      href={href}
                      className="text-cyan-300 underline underline-offset-2 hover:text-cyan-100"
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={href.startsWith("http") ? "noreferrer" : undefined}
                    >
                      {children}
                    </a>
                  );
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto -mx-2 px-2 mb-2">
                    <table className="min-w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border-b border-white/20 px-2 py-1 text-left text-white/80">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="border-b border-white/8 px-2 py-1 text-white/70">{children}</td>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
};

export default MarkdownViewerPanel;
