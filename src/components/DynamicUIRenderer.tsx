import React, { useState, useEffect, useRef } from "react";
import * as Babel from "@babel/standalone";
import { ShieldAlert, ShieldCheck, Copy } from "lucide-react";
import { ActionFlowBar } from "./ui/action-flow-bar";
import { IconButton } from "./ui/icon-button";

interface Props {
  code: string;
}

export interface DynamicUIRendererFlowSummary {
  badges: [string, string, string];
  helper: string;
  tone: "cyan" | "amber";
}

export function getDynamicUIRendererFlowSummary(error: string | null): DynamicUIRendererFlowSummary {
  return {
    badges: ["JSX 변환", "샌드박스 주입", error ? "오류 확인" : "미리보기 확인"],
    helper: error
      ? "오류 내용을 복사해 AI 응답이나 코드 블록으로 다시 넘길 수 있습니다."
      : "실행 결과는 iframe 안에서만 렌더링되며 앱 외부 상태는 변경하지 않습니다.",
    tone: error ? "amber" : "cyan",
  };
}

const DynamicUIRenderer: React.FC<Props> = ({ code }) => {
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const flowSummary = getDynamicUIRendererFlowSummary(error);

  useEffect(() => {
    try {
      // 1. JSX 트랜스파일링
      const transpiled = Babel.transform(code, {
        presets: ["react"],
        filename: "dynamic-component.tsx",
      }).code;

      if (!transpiled) throw new Error("Transpilation failed");

      // 2. iframe 내부로 주입할 HTML 구성 (Sandboxed 환경)
      // React, Lucide, Recharts 등을 CDN을 통해 로드하거나 로컬에서 주입
      const srcDoc = `
        <!DOCTYPE html>
        <html>
          <head>
            <script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
            <script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { margin: 0; background: transparent; overflow: hidden; color: white; font-family: sans-serif; }
              .dynamic-root { padding: 1rem; border-radius: 0.5rem; background: rgba(255, 255, 255, 0.05); }
            </style>
          </head>
          <body>
            <div id="root" class="dynamic-root"></div>
            <script>
              try {
                // React 등 전역 노출
                const React = window.React;
                const ReactDOM = window.ReactDOM;

                // 트랜스파일된 코드 실행
                (function() {
                  ${transpiled.replace(/import\s+.*?\s+from\s+['"].*?['"];?/g, "")}
                  
                  const Component = (typeof exports !== 'undefined' && exports.default) || 
                                    (typeof exports !== 'undefined' && exports.Component) || 
                                    (typeof App !== 'undefined' ? App : null);
                  
                  if (Component) {
                    const root = ReactDOM.createRoot(document.getElementById('root'));
                    root.render(React.createElement(Component));
                  }
                })();
              } catch (err) {
                window.parent.postMessage({ type: 'RENDER_ERROR', error: err.message }, '*');
              }
            </script>
          </body>
        </html>
      `;

      if (iframeRef.current) {
        iframeRef.current.srcdoc = srcDoc;
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'RENDER_ERROR') {
        setError(event.data.error);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [code]);

  return (
    <section
      className="dynamic-ui-wrapper my-4 overflow-hidden rounded-lg border border-white/10"
      aria-label="동적 UI 렌더러"
    >
      <div className="bg-white/5 px-3 py-1 flex items-center justify-between text-xs uppercase tracking-wider font-bold">
        <div className="flex items-center gap-2">
          {error ? <ShieldAlert size={12} className="text-red-400" /> : <ShieldCheck size={12} className="text-green-400" />}
          <span>샌드박스 기반 AI 네이티브 UI</span>
        </div>
        <div className="text-white/40">읽기 전용 샌드박스</div>
      </div>

      <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <ActionFlowBar
          badges={flowSummary.badges}
          helper={flowSummary.helper}
          tone={flowSummary.tone}
        />
      </div>

      {error ? (
        <div
          className="flex items-start justify-between gap-2 bg-red-900/10 p-4 text-xs font-mono text-red-400 whitespace-pre-wrap"
          role="alert"
          aria-live="polite"
        >
          <span className="flex-1 break-words">{error}</span>
          <IconButton
            tooltip="오류 텍스트 복사"
            description="샌드박스 렌더링 오류 문구를 복사합니다."
            onClick={() => {
              navigator.clipboard?.writeText?.(error).catch(() => {});
            }}
            className="p-1 rounded text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors shrink-0"
          >
            <Copy size={12} />
          </IconButton>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title="AI 생성 UI 샌드박스"
          sandbox="allow-scripts"
          aria-label="AI 생성 UI 미리보기"
          className="w-full h-auto min-h-[150px] border-none bg-transparent"
        />
      )}
    </section>
  );
};

export default DynamicUIRenderer;
