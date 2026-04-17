import React, { useState, useEffect } from "react";
import * as Babel from "@babel/standalone";
import * as LucideIcons from "lucide-react";
import * as Recharts from "recharts";

interface Props {
  code: string;
}

const DynamicUIRenderer: React.FC<Props> = ({ code }) => {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // 1. JSX 트랜스파일링
      const transpiled = Babel.transform(code, {
        presets: ["react"],
        filename: "dynamic-component.tsx",
      }).code;

      if (!transpiled) throw new Error("Transpilation failed");

      // 2. 컴포넌트 생성 루틴
      // React, Lucide, Recharts 등을 스코프에 주입
      const exports: any = {};
      const require = (moduleName: string) => {
        if (moduleName === "react") return React;
        if (moduleName === "lucide-react") return LucideIcons;
        if (moduleName === "recharts") return Recharts;
        throw new Error(`Module ${moduleName} is not supported in dynamic UI`);
      };

      const func = new Function("React", "require", "exports", transpiled);
      func(React, require, exports);

      const DynamicComponent = exports.default || exports.Component || Object.values(exports)[0];
      
      if (typeof DynamicComponent !== "function") {
          throw new Error("No valid React component found in exported code");
      }

      setComponent(() => DynamicComponent);
      setError(null);
    } catch (err: any) {
      console.error("Dynamic UI Error:", err);
      setError(err.message);
    }
  }, [code]);

  if (error) {
    return (
      <div className="dynamic-ui-error">
        <div className="flex items-center gap-2 text-red-500 mb-2">
          <LucideIcons.ShieldAlert size={16} />
          <span className="font-bold text-xs uppercase">UI Render Error</span>
        </div>
        <pre className="text-[10px] bg-black/20 p-2 rounded overflow-auto max-h-32 text-red-400">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="dynamic-ui-container">
      {Component ? <Component /> : (
        <div className="flex items-center justify-center p-8 text-dim">
           <LucideIcons.Loader2 size={24} className="animate-spin" />
        </div>
      )}
    </div>
  );
};

export default DynamicUIRenderer;
