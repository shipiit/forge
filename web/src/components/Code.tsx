import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { detectLanguage, tokenClass, tokenizeLine, type Language } from './highlight';

/**
 * Syntax-highlighted code block with terminal chrome.
 *
 * Colors come from the project's own syntax tokens (index.css) rather than a
 * stock highlighter theme, so a code block tracks the palette like everything
 * else on the page.
 */
export function Code({
  label,
  code,
  lang,
  copy = true,
}: {
  label: string;
  code: string;
  lang?: Language;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const language = lang ?? detectLanguage(label);
  const lines = code.replace(/\n+$/, '').split('\n');

  const onCopy = () => {
    if (!navigator.clipboard) return; // Safari in insecure contexts
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[rgb(9_9_12)]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]/80" />
        </span>
        <span aria-hidden className="ml-2 truncate font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
        {copy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? 'Copied to clipboard' : 'Copy code'}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-muted transition-all duration-150 hover:border-white/20 hover:bg-white/[0.06] hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 active:scale-[0.97] motion-reduce:transition-none"
          >
            {copied ? <Check size={12} className="text-[rgb(var(--syn-string))]" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      <pre
        role="region"
        aria-label={label}
        className="overflow-x-auto px-5 py-4 font-mono text-[12.5px] leading-[1.7] text-white/85"
      >
        <code className={`language-${language}`}>
          {lines.map((line, i) => (
            <span key={i} className="block">
              {tokenizeLine(line, language).map((t, j) => (
                <span key={j} className={tokenClass(t.kind)}>
                  {t.value}
                </span>
              ))}
              {line === '' ? ' ' : ''}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
