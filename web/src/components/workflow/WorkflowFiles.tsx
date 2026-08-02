import { useState, type ReactNode } from 'react';
import { FileCode2, ListChecks } from 'lucide-react';
import { WorkflowPreview } from './WorkflowPreview';

export interface GeneratedFile {
  id: string;
  /** File name shown on the tab. */
  name: string;
  /** Directory it belongs in. */
  path: string;
  content: string;
  /** One line: what this file is for. */
  purpose: string;
  /** What the reader should actually do with it. */
  action: string;
  edited: string | null;
  onEdit: (v: string | null) => void;
}

/**
 * Tabbed preview for the generated files.
 *
 * Two files stacked vertically reads as one long wall — and it is genuinely
 * unclear which is which while scrolling. Tabs keep each file whole, and every
 * tab states what that file is for and where it goes, so the pair is never
 * confused for alternatives.
 */
export function WorkflowFiles({ files, guide }: { files: GeneratedFile[]; guide?: ReactNode }) {
  const [active, setActive] = useState(0);
  const guideIndex = files.length;
  const showingGuide = Boolean(guide) && active === guideIndex;
  const current = files[Math.min(active, files.length - 1)]!;

  const tab = (selected: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 motion-reduce:transition-none ${
      selected ? 'bg-white/[0.09] text-text shadow-insetLine' : 'text-muted hover:bg-white/[0.04] hover:text-text'
    }`;

  return (
    <div className="sticky top-24">
      <div
        role="tablist"
        aria-label="Generated files"
        className="mb-3 flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
      >
        {files.map((f, i) => (
          <button
            key={f.id}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`${tab(i === active)} font-mono`}
          >
            <FileCode2 size={13} aria-hidden />
            {f.name}
          </button>
        ))}
        {guide && (
          <button
            role="tab"
            type="button"
            aria-selected={showingGuide}
            onClick={() => setActive(guideIndex)}
            className={`${tab(showingGuide)} font-medium`}
          >
            <ListChecks size={13} aria-hidden />
            Setup steps
          </button>
        )}
      </div>

      {showingGuide ? (
        guide
      ) : (
        <>
          <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <p className="text-[12.5px] leading-relaxed text-muted">
              <span className="font-semibold text-text">{current.purpose}</span> {current.action}
            </p>
          </div>

          <WorkflowPreview
            yaml={current.content}
            edited={current.edited}
            onEdit={current.onEdit}
            onReset={() => current.onEdit(null)}
            filename={current.name}
            path={current.path}
          />
        </>
      )}
    </div>
  );
}
