import { useState } from 'react';

/** Terminal-styled code block with a copy button and a small language label. */
export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <div className="top">
        <span className="dot" style={{ background: '#ff5f56' }} />
        <span className="dot" style={{ background: '#ffbd2e' }} />
        <span className="dot" style={{ background: '#27c93f' }} />
        <span className="label">{label}</span>
        <button
          className="cp"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}
