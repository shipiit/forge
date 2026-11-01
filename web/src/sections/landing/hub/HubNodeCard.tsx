import {
  BarChart3, Bot, Bug, CheckCircle2, Cloud, FileCode2, FileDiff, FileText, FolderOpen, GitBranch, GitCommit,
  GitPullRequest, Globe, History, Image, KeyRound, Layers, Lock, MessageSquare, MessagesSquare, Package, Plug, RotateCw, Zap,
  ScanSearch, ScrollText, ShieldAlert, Skull, Sparkles, Syringe, Terminal, Wand2, Workflow, CircleDot,
  type LucideIcon,
} from 'lucide-react';
import type { HubIcon, HubNode } from '../lib/hub';

const ICONS: Record<HubIcon, LucideIcon> = {
  diff: FileDiff, file: FileCode2, callers: GitBranch, history: History, image: Image,
  rules: ScrollText, context: Layers, scan: ScanSearch, package: Package, thread: MessagesSquare,
  key: KeyRound, syringe: Syringe, folder: FolderOpen, globe: Globe, lock: Lock,
  skull: Skull, bug: Bug, script: Terminal, cloud: Cloud, workflow: Workflow,
  comment: MessageSquare, suggest: Wand2, summary: FileText, check: CheckCircle2, sarif: ShieldAlert,
  issue: CircleDot, pr: GitPullRequest, commit: GitCommit, doc: Sparkles, chart: BarChart3,
  model: Bot, bolt: Zap, layers: Layers, plug: Plug, fallback: RotateCw,
};

interface HubNodeCardProps {
  node: HubNode;
  active: boolean;
}

export function HubNodeCard({ node, active }: HubNodeCardProps) {
  const Icon = ICONS[node.icon];
  return (
    <div
      className={`flex items-center gap-3 border bg-[rgb(13_13_17)] px-4 py-3 transition-colors duration-500 ${
        active ? 'border-accentWarm/50 shadow-[0_0_0_1px_rgba(251,146,60,0.15),0_12px_40px_-12px_rgba(251,146,60,0.35)]' : 'border-white/[0.09]'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors duration-500 ${
          active ? 'border-accentWarm/40 bg-accentWarm/10 text-accentWarm' : 'border-white/10 bg-white/[0.03] text-white/70'
        }`}
      >
        {node.logo ? (
          <span
            aria-hidden
            className="h-[18px] w-[18px] bg-current"
            style={{
              maskImage: `url(${import.meta.env.BASE_URL}logos/${node.logo}.svg)`,
              WebkitMaskImage: `url(${import.meta.env.BASE_URL}logos/${node.logo}.svg)`,
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
            }}
          />
        ) : (
          <Icon size={17} aria-hidden />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{node.title}</span>
        <span className="block truncate text-[12.5px] text-muted">{node.detail}</span>
      </span>
    </div>
  );
}
