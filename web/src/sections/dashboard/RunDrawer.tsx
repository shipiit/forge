import { useEffect, useState } from 'react';
import { StatusPill } from './Tables';
import { Empty } from './charts';
import { Transcript } from './Transcript';
import { Facts, Findings, Panel, Tools, Turns } from './RunPanels';
import { fetchUsage, usageHref, type RunDetail } from '../../lib/usage';
import { fmtNum } from '../../lib/format';

/**
 * One run, turn by turn.
 *
 * This is the view that answers "why did that one cost $2.40": which segment
 * ran long, which turn stopped reusing the cache, which tool failed and what it
 * said. A list can only ever show the total.
 */

/** What the run left behind: the commit, the PR, the issue, the comment. */
function Outputs({ outputs }: { outputs: RunDetail['outputs'] }) {
  if (!outputs?.length) return null;
  return (
    <Panel title="What this run produced" hint={`${outputs.length} ${outputs.length === 1 ? 'thing' : 'things'}`}>
      <div className="grid gap-2">
        {outputs.map((o, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line/[0.05] pt-2 text-[12.5px] first:border-0 first:pt-0">
            <span className="w-[92px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">
              {o.kind.replace('_', ' ')}
            </span>
            <span className="min-w-0 flex-1 truncate">{o.title ?? o.ref ?? '—'}</span>
            {o.url && (
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-accent hover:underline">
                open ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** The conversation, folded away until asked for — it is the largest thing here. */
function TranscriptPanel({ artifacts }: { artifacts: RunDetail['artifacts'] }) {
  const [open, setOpen] = useState(false);
  const transcript = artifacts.find((a) => a.kind === 'transcript');
  if (!transcript) return null;

  return (
    <section className="rounded-2xl border border-line/[0.08] bg-panel p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h3 className="text-[13.5px] font-semibold">Transcript</h3>
          <p className="mt-0.5 text-xs text-muted">Every message, tool call and tool result, in order</p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-[9px] border border-line/[0.12] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:text-text"
        >
          {open ? 'Hide' : 'Read it'}
        </button>
      </div>
      {open && (
        <div className="mt-4 border-t border-line/[0.06] pt-4">
          <Transcript artifactId={transcript.id} />
        </div>
      )}
    </section>
  );
}

export function RunDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<RunDetail>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    setDetail(undefined);
    setError(undefined);
    let live = true;
    fetchUsage<RunDetail>(`api/runs/${id}`)
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

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-150 ${id ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        aria-hidden={!id}
        aria-label="Run detail"
        className={`fixed inset-y-0 right-0 z-50 w-[min(840px,100vw)] overflow-y-auto border-l border-line/[0.08] bg-canvas transition-transform duration-200 ${
          id ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line/[0.08] bg-canvas/95 px-5 py-4 backdrop-blur">
          <div className="flex-1">
            {detail ? (
              <>
                <div className="flex items-center gap-2.5">
                  <StatusPill status={detail.run.status} />
                  <h2 className="text-[15px] font-semibold">
                    {detail.run.flow} · {detail.run.owner}/{detail.run.repo}
                  </h2>
                </div>
                <p className="mt-0.5 font-mono text-[11.5px] text-faint">run_{detail.run.id.slice(-8)}</p>
              </>
            ) : (
              <div className="h-4 w-52 animate-pulse rounded bg-line/[0.07]" />
            )}
          </div>
          {detail && (
            <a href={usageHref(`api/runs/${detail.run.id}`)} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-muted hover:text-text">
              raw ↗
            </a>
          )}
          <button onClick={onClose} aria-label="Close run detail" className="grid h-8 w-8 place-items-center rounded-[9px] border border-line/[0.08] text-muted hover:text-text">
            ✕
          </button>
        </div>

        <div className="grid gap-4 px-5 pb-16 pt-4">
          {error && <Empty title="Could not load this run">{error}</Empty>}
          {!detail && !error && <div className="h-40 animate-pulse rounded-2xl bg-line/[0.05]" />}
          {detail && (
            <>
              <Facts run={detail.run} />
              <Outputs outputs={detail.outputs} />
              <TranscriptPanel artifacts={detail.artifacts} />
              <Findings findings={detail.findings} />
              <Turns turns={detail.turns} />
              <Tools tools={detail.tools} />
              {detail.artifacts.length > 0 && (
                <Panel title="Artifacts" hint="raw, gzipped, kept only as long as retention allows">
                  <div className="grid gap-2">
                    {detail.artifacts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-[12.5px]">
                        <span>{a.kind}</span>
                        <span className="font-mono text-xs text-muted">{fmtNum(a.bytes)} B gzipped</span>
                        <a href={usageHref(`api/artifacts/${a.id}`)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          open ↗
                        </a>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
