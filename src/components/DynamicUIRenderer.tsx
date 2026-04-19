import React, { useState, useEffect, useRef } from "react";
import * as Babel from "@babel/standalone";
import { ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  code: string;
}

const DynamicUIRenderer: React.FC<Props> = ({ code }) => {
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
    <div className="dynamic-ui-wrapper border border-white/10 rounded-lg overflow-hidden my-4">
      <div className="bg-white/5 px-3 py-1 flex items-center justify-between text-[10px] uppercase tracking-wider font-bold">
        <div className="flex items-center gap-2">
          {error ? <ShieldAlert size={12} className="text-red-400" /> : <ShieldCheck size={12} className="text-green-400" />}
          <span>Sandboxed AI Native UI</span>
        </div>
        <div className="text-white/40">Read-Only Sandbox</div>
      </div>
      
      {error ? (
        <div className="p-4 bg-red-900/10 text-red-400 text-xs font-mono whitespace-pre-wrap">
          {error}
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title="AI Generated UI Sandbox"
          sandbox="allow-scripts"
          className="w-full h-auto min-h-[150px] border-none bg-transparent"
          onLoad={(e) => {
             // iframe 높이 자동 조절 등 추가 가능
          }}
        />
      )}
    </div>
  );
};

export default DynamicUIRenderer;
