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
import { Zap, LayoutGrid } from 'lucide-react';

interface Props {
  blocks: TerminalBlock[];
  onNodeMove: (id: string, x: number, y: number) => void;
}

const InfiniteCanvas: React.FC<Props> = ({ blocks, onNodeMove }) => {
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
            <pre className="node-output">{block.output.slice(0, 100)}...</pre>
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
        <Panel position="top-right" className="bg-black/50 p-2 rounded-lg border border-white/10">
           <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40">
              <LayoutGrid size={12} />
              <span>Spatial Workspace (v2.0 PoC)</span>
           </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default InfiniteCanvas;
