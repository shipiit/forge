import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, PanelRightOpen, X } from 'lucide-react';
import { Empty } from './charts';
import { fetchUsage } from '../../lib/usage';
import { ruleLabel } from '../../lib/cwe';
import { fmtAgo } from '../../lib/format';

/** One finding as the detail endpoint returns it. */
export interface FindingDetail {
  id: string;
  run_id: string;
  file: string;
  line: number | null;
  start_line: number | null;
  lens: string;
  severity: string;
  category: string | null;
  title: string;
  body: string | null;
  suggestion: string | null;
  pre_existing: number;
  posted_inline: number;
  owner: string;
  repo: string;
  flow: string;
  model: string;
  started_at: number;
  result_url: string | null;
  pr_number: number | null;
}

const TONE: Record<string, string> = {
  critical: 'border-bad/40 bg-bad/10 text-bad',
  high: 'border-accentWarm/40 bg-accentWarm/10 text-accentWarm',
  medium: 'border-warn/40 bg-warn/10 text-warn',
  low: 'border-info/40 bg-info/10 text-info',
  info: 'border-line/20 text-muted',
};

function lines(d: FindingDetail): string {
  if (!d.line) return '';
  return d.start_line && d.start_line !== d.line ? `L${d.start_line}-L${d.line}` : `L${d.line}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-[13px]">{children}</dd>
    </div>
  );
}

export function FindingDrawer({ id, onClose, onOpenRun }: { id: string | null; onClose: () => void; onOpenRun: (runId: string) => void }) {
  const [detail, setDetail] = useState<FindingDetail>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!id) return;
    setDetail(undefined);
    setError(undefined);
    setCopied(false);
    closeRef.current?.focus();
    let live = true;
    fetchUsage<FindingDetail>('api/findings/detail', { id })
      .then((d) => live && setDetail(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const copy = async () => {
    if (!detail?.suggestion) return;
    try {
      await navigator.clipboard.writeText(detail.suggestion);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const github = detail ? `https://github.com/${detail.owner}/${detail.repo}/blob/HEAD/${detail.file}${detail.line ? `#${lines(detail)}` : ''}` : '';

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-150 ${id ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside
        aria-hidden={!id}
        aria-label="Finding detail"
        role="dialog"
        className={`fixed inset-y-0 right-0 z-50 w-[min(720px,100vw)] overflow-y-auto border-l border-line/[0.08] bg-canvas transition-transform duration-200 ${id ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line/[0.08] bg-canvas/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            {detail ? (
              <>
                <span className={`inline-block border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${TONE[detail.severity] ?? TONE.info}`}>
                  {detail.severity}
                </span>
                <h2 className="mt-2 text-[16px] font-semibold leading-snug">{detail.title}</h2>
                <p className="mt-1 font-mono text-[12px] text-muted">{ruleLabel(detail.category)}</p>
              </>
            ) : (
              <div className="h-4 w-60 animate-pulse rounded bg-line/[0.07]" />
            )}
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close finding detail" className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-line/[0.08] text-muted hover:text-text">
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="grid gap-5 px-5 pb-16 pt-5">
          {error && <Empty title="Could not load this finding">{error}</Empty>}
          {!detail && !error && <div className="h-40 animate-pulse rounded-2xl bg-line/[0.05]" />}
          {detail && (
            <>
              <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-line/[0.08] bg-panel p-4 sm:grid-cols-3">
                <Fact label="Location">
                  <span className="font-mono text-[12.5px]">{detail.file}{detail.line ? `:${lines(detail).replace(/L/g, '')}` : ''}</span>
                </Fact>
                <Fact label="Repository">{detail.owner}/{detail.repo}{detail.pr_number ? ` · PR #${detail.pr_number}` : ''}</Fact>
                <Fact label="Reported by">{detail.flow} · {detail.lens}</Fact>
                <Fact label="Model"><span className="font-mono text-[12.5px]">{detail.model}</span></Fact>
                <Fact label="When">{fmtAgo(detail.started_at)}</Fact>
                <Fact label="Status">
                  {detail.pre_existing ? 'Already on the base branch' : 'Introduced by the change'}
                  {detail.posted_inline ? ' · commented inline' : ''}
                </Fact>
              </dl>

              <section aria-labelledby="fd-why">
                <h3 id="fd-why" className="text-[13.5px] font-semibold">Why it matters</h3>
                {detail.body ? (
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-line/[0.08] bg-panel p-4 font-sans text-[13px] leading-relaxed text-text/90">
                    {detail.body}
                  </pre>
                ) : (
                  <p className="mt-2 text-[13px] text-muted">This finding was recorded before explanations were kept. Open the run to read it in the transcript.</p>
                )}
              </section>

              {detail.suggestion && (
                <section aria-labelledby="fd-fix">
                  <div className="flex items-center justify-between">
                    <h3 id="fd-fix" className="text-[13.5px] font-semibold">Suggested fix</h3>
                    <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-[9px] border border-line/[0.1] px-2.5 py-1 text-[12px] text-muted hover:text-text">
                      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-2xl border border-ok/25 bg-ok/[0.05] p-4 font-mono text-[12.5px] leading-relaxed">
                    {detail.suggestion}
                  </pre>
                  <p className="mt-1.5 text-[11.5px] text-faint">Replaces {lines(detail) || 'the reported lines'} in {detail.file}.</p>
                </section>
              )}

              <div className="flex flex-wrap gap-2">
                <a href={github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-[10px] border border-line/[0.12] px-3 py-2 text-[12.5px] hover:border-line/30">
                  <ExternalLink size={13} aria-hidden /> Open the line on GitHub
                </a>
                {detail.result_url && (
                  <a href={detail.result_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-[10px] border border-line/[0.12] px-3 py-2 text-[12.5px] hover:border-line/30">
                    <ExternalLink size={13} aria-hidden /> Open the review
                  </a>
                )}
                <button onClick={() => onOpenRun(detail.run_id)} className="inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-3 py-2 text-[12.5px] font-semibold text-black">
                  <PanelRightOpen size={13} aria-hidden /> Open the run that found it
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
