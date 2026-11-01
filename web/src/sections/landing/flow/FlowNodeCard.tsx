import { BadgeCheck, FileSearch, GitPullRequest, MessageSquareText, ScanSearch, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { FlowNode, FlowNodeId } from '../lib/flow';

const ICONS: Record<FlowNodeId, LucideIcon> = {
  pr: GitPullRequest,
  scanners: ScanSearch,
  correctness: FileSearch,
  security: ShieldAlert,
  failure: TriangleAlert,
  verifier: BadgeCheck,
  posted: MessageSquareText,
};

interface FlowNodeCardProps {
  node: FlowNode;
  lit: boolean;
  /** A step has already passed through this node. */
  done: boolean;
}

export function FlowNodeCard({ node, lit, done }: FlowNodeCardProps) {
  const Icon = ICONS[node.id];
  return (
    <div
      className={`relative flex items-center gap-3 border bg-[rgb(13_13_17)] px-4 py-3 transition-all duration-500 ${
        lit
          ? 'border-accentWarm/60 shadow-[0_0_0_1px_rgba(251,146,60,0.2),0_18px_50px_-15px_rgba(251,146,60,0.55)]'
          : done
            ? 'border-white/15'
            : 'border-white/[0.08] opacity-60'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors duration-500 ${
          lit ? 'border-accentWarm/40 bg-accentWarm/10 text-accentWarm' : 'border-white/10 bg-white/[0.03] text-white/70'
        }`}
      >
        <Icon size={17} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          {node.title}
          {node.badge && <span className="border border-ok/40 px-1.5 text-[9px] uppercase tracking-[0.14em] text-ok">{node.badge}</span>}
        </span>
        <span className="block text-[12px] text-muted">{node.detail}</span>
      </span>
    </div>
  );
}
