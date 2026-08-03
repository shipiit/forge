import type { RunDetail } from '../../lib/usage';
import { fmtMs, fmtNum, fmtUsd, fmtWhen } from '../../lib/format';

/**
 * The panels inside the run drawer.
 *
 * Split out from the drawer itself so that file stays about opening, closing
 * and loading, and this one stays about presenting.
 */

const TH = 'px-3 pb-2.5 text-left text-[11px] font-medium uppercase tracking-[0.07em] text-faint whitespace-nowrap';
const TD = 'border-t border-line/[0.05] px-3 py-2 align-middle whitespace-nowrap';

export function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/[0.08] bg-panel p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function Facts({ run }: { run: RunDetail['run'] }) {
  const saved = Math.max(0, Number(run.usd_uncached) - Number(run.usd));
  const facts: Array<[string, React.ReactNode]> = [
    ['Started', fmtWhen(run.started_at)],
    ['Duration', run.ended_at ? fmtMs(run.ended_at - run.started_at) : 'still running'],
    ['Trigger', run.trigger],
    ['Actor', run.actor ?? '—'],
    ['Model', run.model],
    ['Provider', run.provider],
    ['Turns', `${run.iterations}${run.stopped_by && run.stopped_by !== 'end' ? ` (${run.stopped_by})` : ''}`],
    ['Tokens', fmtNum(Number(run.input_tokens) + Number(run.output_tokens) + Number(run.cache_read))],
    ['Cost', `${fmtUsd(run.usd, true)}${saved > 0 ? ` · saved ${fmtUsd(saved, true)}` : ''}`],
  ];
  if (run.skill) facts.push(['Skill', run.skill]);
  if (run.routine) facts.push(['Routine', run.routine]);

  return (
    <section className="rounded-2xl border border-line/[0.08] bg-panel p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k}>
            <span className="block text-[10.5px] uppercase tracking-[0.07em] text-faint">{k}</span>
            <b className="text-[13px] font-medium">{v}</b>
          </div>
        ))}
      </div>
      {run.result_url && (
        <a href={run.result_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[12.5px] text-accent hover:underline">
          {run.result_url.replace(/^https:\/\//, '')} ↗
        </a>
      )}
      {run.error && (
        <pre className="mt-3 max-h-52 overflow-auto rounded-[10px] border border-line/[0.08] bg-panelStrong p-3 font-mono text-xs leading-relaxed text-bad">
          {run.error}
        </pre>
      )}
    </section>
  );
}

export function Turns({ turns }: { turns: RunDetail['turns'] }) {
  if (!turns.length) return null;
  // Grouped by phase: a fix is the fix, then the self-review over its diff, then
  // whatever it delegated. Summed together they hide which part was expensive.
  const phases = new Map<string, RunDetail['turns']>();
  for (const t of turns) phases.set(t.phase, [...(phases.get(t.phase) ?? []), t]);

  return (
    <>
      {[...phases].map(([phase, rows]) => (
        <Panel key={phase} title={phase} hint={`${rows.length} turns · ${fmtNum(rows.reduce((a, t) => a + t.input_tokens + t.output_tokens, 0))} tokens`}>
          <div className="-mx-1.5 overflow-x-auto px-1.5">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>#</th>
                  <th className={`${TH} text-right`}>Latency</th>
                  <th className={`${TH} text-right`}>In</th>
                  <th className={`${TH} text-right`}>Out</th>
                  <th className={`${TH} text-right`}>Cache read</th>
                  <th className={`${TH} text-right`}>Cache write</th>
                  <th className={TH}>Stopped</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.idx}>
                    <td className={`${TD} tabular-nums`}>{t.idx}</td>
                    <td className={`${TD} text-right font-mono tabular-nums`}>{fmtMs(t.latency_ms)}</td>
                    <td className={`${TD} text-right font-mono tabular-nums`}>{fmtNum(t.input_tokens)}</td>
                    <td className={`${TD} text-right font-mono tabular-nums`}>{fmtNum(t.output_tokens)}</td>
                    <td className={`${TD} text-right font-mono tabular-nums text-ok`}>{t.cache_read ? fmtNum(t.cache_read) : '—'}</td>
                    <td className={`${TD} text-right font-mono tabular-nums text-muted`}>{t.cache_write ? fmtNum(t.cache_write) : '—'}</td>
                    <td className={`${TD} text-muted`}>{t.stop_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </>
  );
}

export function Tools({ tools }: { tools: RunDetail['tools'] }) {
  if (!tools.length) return null;
  return (
    <Panel title="Tool calls" hint={`${tools.length} in order`}>
      <div className="-mx-1.5 overflow-x-auto px-1.5">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={TH}>Tool</th>
              <th className={TH}>Phase</th>
              <th className={`${TH} text-right`}>Turn</th>
              <th className={`${TH} text-right`}>Took</th>
              <th className={`${TH} text-right`}>Output</th>
              <th className={TH}>Result</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t, i) => (
              <tr key={i}>
                <td className={TD}>
                  <span className="rounded-md bg-line/[0.06] px-1.5 py-0.5 font-mono text-[11.5px] text-muted">{t.name}</span>
                </td>
                <td className={`${TD} text-muted`}>{t.phase}</td>
                <td className={`${TD} text-right tabular-nums`}>{t.turn_idx}</td>
                <td className={`${TD} text-right font-mono tabular-nums`}>{fmtMs(t.duration_ms)}</td>
                <td className={`${TD} text-right font-mono tabular-nums text-muted`}>{t.output_bytes ? `${fmtNum(t.output_bytes)}B` : '—'}</td>
                <td className={TD}>{t.ok ? <span className="text-muted">ok</span> : <span className="text-bad">{t.error ?? 'failed'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function Findings({ findings }: { findings: RunDetail['findings'] }) {
  if (!findings.length) return null;
  const tone = (s: string) => (s === 'critical' || s === 'high' ? 'text-bad' : s === 'medium' ? 'text-warn' : 'text-muted');
  return (
    <Panel title="Findings" hint={`${findings.length} reported`}>
      <div className="grid gap-2.5">
        {findings.map((f, i) => (
          <div key={i} className="grid grid-cols-[72px_1fr] gap-3 border-t border-line/[0.05] pt-2.5 text-[12.5px] first:border-0 first:pt-0">
            <span className={`text-[11.5px] font-semibold uppercase ${tone(f.severity)}`}>{f.severity}</span>
            <div className="min-w-0">
              <div className="truncate">{f.title}</div>
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-faint">
                {f.file}
                {f.line ? `:${f.line}` : ''} · {f.lens}
                {f.category ? ` · ${f.category}` : ''}
                {f.pre_existing ? ' · pre-existing' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
