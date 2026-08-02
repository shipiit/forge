import { useState } from 'react';
import { Check, Copy, Download, Pencil, RotateCcw } from 'lucide-react';
import { tokenClass, tokenizeLine } from '../highlight';

/**
 * The live output pane: syntax-highlighted by default, editable on demand.
 *
 * Editing is explicit rather than always-on. A textarea cannot show highlighted
 * code, so leaving it permanently editable would mean giving up the colour that
 * makes the preview readable — the toggle keeps both.
 */
export function WorkflowPreview({
  yaml,
  edited,
  onEdit,
  onReset,
  filename,
  path = '.github/workflows/',
}: {
  yaml: string;
  /** The user's edited copy, or null when following the form. */
  edited: string | null;
  onEdit: (value: string | null) => void;
  onReset: () => void;
  filename: string;
  /** Directory shown in the chrome bar, so two files are never confused. */
  path?: string;
}) {
  const [copied, setCopied] = useState(false);
  const isEditing = edited !== null;
  const text = edited ?? yaml;

  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn =
    'inline-flex items-center gap-1.5 rounded-md border border-white/[0.09] px-2.5 py-1.5 text-[11px] ' +
    'text-muted transition-all duration-150 hover:border-white/25 hover:bg-white/[0.06] hover:text-text ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 ' +
    'active:scale-[0.97] motion-reduce:transition-none';

  return (
    <figure className="sticky top-24 overflow-hidden rounded-xl border border-white/[0.08] bg-[rgb(9_9_12)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]/80" />
        </span>
        <span aria-hidden className="ml-2 truncate font-mono text-[11px] text-muted">
          {path}
          {filename}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(isEditing ? null : text)}
            aria-pressed={isEditing}
            className={`${btn} ${isEditing ? 'border-[rgb(var(--syn-keyword))]/40 text-[rgb(var(--syn-keyword))]' : ''}`}
          >
            <Pencil size={12} />
            {isEditing ? 'Editing' : 'Edit'}
          </button>
          {isEditing && (
            <button type="button" onClick={onReset} className={btn}>
              <RotateCcw size={12} />
              Reset
            </button>
          )}
          <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy workflow'} className={btn}>
            {copied ? <Check size={12} className="text-[rgb(var(--syn-string))]" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={download} className={`${btn} !text-text`}>
            <Download size={12} />
            Download
          </button>
        </span>
      </div>

      {isEditing ? (
        <textarea
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          spellCheck={false}
          aria-label="Workflow YAML"
          className="h-[560px] w-full resize-none bg-transparent px-5 py-4 font-mono text-[12.5px] leading-[1.7] text-white/85 focus:outline-none"
        />
      ) : (
        <pre
          role="region"
          aria-label="Generated workflow"
          className="max-h-[560px] overflow-auto px-5 py-4 font-mono text-[12.5px] leading-[1.7] text-white/85"
        >
          <code className="language-yaml">
            {text.split('\n').map((line, i) => (
              <span key={i} className="block">
                {tokenizeLine(line, 'yaml').map((t, j) => (
                  <span key={j} className={tokenClass(t.kind)}>
                    {t.value}
                  </span>
                ))}
                {line === '' ? ' ' : ''}
              </span>
            ))}
          </code>
        </pre>
      )}
    </figure>
  );
}
