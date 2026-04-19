import React, { useState, useEffect } from "react";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import SetupWizard from "./components/SetupWizard";
import DynamicUIRenderer from "./components/DynamicUIRenderer";
import CodeReviewDashboard from "./components/CodeReviewDashboard";
import { Search, Settings, Layers, Zap, Plus, X, Command } from "lucide-react";

const App: React.FC = () => {
  // 1. 커스텀 훅을 통한 상태 관리
  const { blocks, activeTab, addBlock, updateBlock, clearBlocks } = useTerminalBlocks();
  const { isProcessing, processAICommand, analyzeError } = useAIProcessing();

  // 2. 앱 UI 상태
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);

  // 3. 앱 부트스트래핑
  useEffect(() => {
    // 하드웨어 체크 및 온보딩 로직 (기존 구현 유지)
    console.log("LUM Initialized");
  }, []);

  return (
    <div className="app-root bg-terminal-dark text-white min-h-screen flex flex-col">
      {/* 4. 분리된 마법사 컴포넌트 */}
      {showSetupWizard && (
        <SetupWizard 
          step={setupStep}
          setStep={setSetupStep}
          onClose={() => setShowSetupWizard(false)}
          hardwareSpecs={null} // 실제 데이터 전달
          pullProgress={null}
          handlePullModel={() => {}}
          models={[]}
          recommendedModel="qwen2.5-coder:7b"
          syncOllama={async () => {}}
        />
      )}

      {/* 5. 메인 레이아웃 및 터미널 영역 */}
      <header className="h-10 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-accent" />
            <span className="text-xs font-bold tracking-widest uppercase">LUM Console</span>
          </div>
          <nav className="flex gap-2">
            <button className="text-[10px] px-2 py-1 bg-white/10 rounded">Main Tab</button>
            <button className="text-[10px] px-2 py-1 text-white/40"><Plus size={10} /></button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={() => setIsPaletteOpen(true)}><Search size={14} className="text-white/40" /></button>
           <button><Settings size={14} className="text-white/40" /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {/* 터미널 블록 리스트 렌더링 (Virtual List 생략) */}
        <div className="p-4 space-y-4">
          {blocks.map((block) => (
            <div key={block.id} className="block-card p-3 bg-white/5 rounded-lg border border-white/5">
               <div className="text-xs text-white/40 flex items-center gap-2 mb-2">
                 <Command size={10} />
                 <span>{block.command}</span>
               </div>
               <pre className="text-xs font-mono">{block.output}</pre>
               
               {/* 분리된 대시보드 렌더링 */}
               {block.type === "review" && (
                 <CodeReviewDashboard report={null} />
               )}
            </div>
          ))}
        </div>
      </main>

      <footer className="h-12 border-t border-white/5 px-4 flex items-center">
         <div className="flex-1 flex items-center gap-2">
           <Zap size={14} className="text-accent" />
           <input 
             className="bg-transparent border-none outline-none text-xs flex-1"
             placeholder="궁금한 것이나 명령어를 입력하세요 (/명령어, ?검색)"
           />
         </div>
      </footer>
    </div>
  );
};

export default App;
