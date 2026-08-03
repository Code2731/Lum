import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Node,
  Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TerminalBlock } from '../../hooks/useTerminalBlocks';
import { Zap, LayoutGrid, Sparkles } from 'lucide-react';
import { ActionFlowBar } from '@/components/ui/action-flow-bar';

interface Props {
  blocks: TerminalBlock[];
  onNodeMove: (id: string, x: number, y: number) => void;
}

export interface InfiniteCanvasFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getInfiniteCanvasEmptyFlowSummary(): InfiniteCanvasFlowSummary {
  return {
    badges: ["먼저 블록 생성", "다음 위치 정리", "마지막 연결 추적"],
    helper: "터미널 블록이 생기면 먼저 캔버스에 배치하고, 위치를 정리한 뒤 링크 흐름을 따라 작업 맥락을 확인합니다.",
  };
}

export function getInfiniteCanvasGuideFlowSummary(blockCount: number, edgeCount: number): InfiniteCanvasFlowSummary {
  return {
    badges: [`블록 ${blockCount}개`, `연결 ${edgeCount}개`, "드래그·줌 탐색"],
    helper: "드래그로 블록을 재배치하고, 휠로 줌을 조정한 뒤 연결선을 따라 명령 흐름과 AI 응답 맥락을 빠르게 확인합니다.",
  };
}

const InfiniteCanvas: React.FC<Props> = ({ blocks, onNodeMove }) => {
  const edgeCount = useMemo(
    () => blocks.reduce((count, block) => count + block.links.length, 0),
    [blocks],
  );
  const emptyFlow = getInfiniteCanvasEmptyFlowSummary();
  const guideFlow = getInfiniteCanvasGuideFlowSummary(blocks.length, edgeCount);

  // 1. 블록 데이터를 React Flow 노드로 변환
  const nodes: Node[] = useMemo(() => {
    return blocks.map((block) => ({
      id: block.id,
      position: block.position,
      data: { 
        label: (
          <div className="canvas-node-content">
            <div className="node-header">
               <Zap size={10} className="text-accent" />
               <span>{block.command || 'AI Response'}</span>
            </div>
            <pre className="node-output">
              {block.output.length > 100 ? `${block.output.slice(0, 100)}...` : block.output}
            </pre>
          </div>
        ) 
      },
      className: `canvas-block-node status-${block.status} type-${block.type}`,
      draggable: true,
      dragHandle: '.node-header',
    }));
  }, [blocks]);

  // 2. 연결 정보를 화살표 연결선(Edge)으로 변환
  const edges: Edge[] = useMemo(() => {
    const newEdges: Edge[] = [];
    blocks.forEach((block) => {
      block.links.forEach((targetId) => {
        newEdges.push({
          id: `edge-${block.id}-${targetId}`,
          source: block.id,
          target: targetId,
          animated: true,
          style: { stroke: 'var(--accent)', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' },
        });
      });
    });
    return newEdges;
  }, [blocks]);

  return (
    <div className="w-full h-full bg-terminal-dark overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeDragStop={(_, node) => onNodeMove(node.id, node.position.x, node.position.y)}
        fitView
        colorMode="dark"
      >
        <Background gap={20} color="#ffffff10" />
        <Controls />
        {blocks.length === 0 && (
          <Panel
            position="top-left"
            className="!left-1/2 !top-1/2 w-[min(420px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#11161d]/92 p-4 shadow-lg"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-white/88">
              <Sparkles size={14} className="text-accent" />
              <span>스페이셜 워크스페이스를 시작할 준비가 됐습니다</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/52">
              아직 배치된 터미널 블록이 없습니다. 명령 실행이나 AI 응답이 쌓이면 이 캔버스에서 흐름을 드래그로 정리하고 연결 관계를 한눈에 볼 수 있습니다.
            </p>
            <div className="mt-3">
              <ActionFlowBar
                badges={emptyFlow.badges}
                helper={emptyFlow.helper}
                tone="cyan"
              />
            </div>
          </Panel>
        )}
        <Panel position="top-left" className="max-w-[320px] rounded-lg border border-white/10 bg-black/55 p-2.5">
          <div className="text-[11px] text-white/76">
            <div className="flex items-center gap-2 font-semibold text-white/86">
              <LayoutGrid size={12} className="text-accent" />
              <span>캔버스 조작 가이드</span>
            </div>
            <div className="mt-2">
              <ActionFlowBar badges={guideFlow.badges} helper={guideFlow.helper} tone="neutral" />
            </div>
          </div>
        </Panel>
        <Panel position="top-right" className="bg-black/50 p-2 rounded-lg border border-white/10">
           <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40">
              <LayoutGrid size={12} />
              <span>Spatial Workspace (v2.0 PoC)</span>
           </div>
           <p className="mt-1 text-[10px] text-white/46">
             블록 {blocks.length}개 · 연결 {edgeCount}개
           </p>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default InfiniteCanvas;
