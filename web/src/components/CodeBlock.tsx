import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Terminal-chrome code block with a copy button. */
export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3 overflow-hidden rounded-xl border border-line bg-[#070b18]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-auto font-mono text-xs text-muted">{label}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="ml-2 inline-flex items-center gap-1 rounded-md border border-line bg-panelStrong px-2 py-1 text-xs text-text/80 hover:text-text"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-auto px-4 py-3.5 font-mono text-[13px] leading-7 text-[#dbe4ff]">{code}</pre>
    </div>
  );
}
