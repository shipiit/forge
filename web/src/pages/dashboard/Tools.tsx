import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../sections/dashboard/Shell';
import { DashboardLayout, type DashboardContext } from '../../sections/dashboard/Layout';
import { BarList, Empty, Sparkline } from '../../sections/dashboard/charts';
import { Chip, Mono, Stacked, Table, type Column } from '../../sections/dashboard/Table';
import { RunDrawer } from '../../sections/dashboard/RunDrawer';
import { useUsage, type ToolRow } from '../../lib/usage';
import { fmtAgo, fmtMs, fmtNum, fmtPct } from '../../lib/format';

/**
 * Tool reliability, in full.
 *
 * The overview ranks tools; this page answers the next question — which calls
 * failed, on which run, and what the tool actually said. An error rate on its
 * own tells you something is wrong, never what.
 */

interface TrendRow {
  name: string;
  day: string;
  avg_ms: number;
  calls: number;
}
interface ErrorRow {
  name: string;
  phase: string;
  turn_idx: number;
  duration_ms: number;
  error: string | null;
  args_preview: string | null;
  run_id: string;
  owner: string;
  repo: string;
  flow: string;
  started_at: number;
}

const errRate = (t: ToolRow) => (t.calls ? (t.errors / t.calls) * 100 : 0);

function toolColumns(trend: Map<string, number[]>): Array<Column<ToolRow>> {
  return [
    { key: 'name', header: 'Tool', sortBy: (t) => t.name, cell: (t) => <Chip>{t.name}</Chip> },
    { key: 'calls', header: 'Calls', align: 'right', sortBy: (t) => t.calls, cell: (t) => fmtNum(t.calls) },
    {
      key: 'errors',
      header: 'Errors',
      align: 'right',
      sortBy: errRate,
      cell: (t) => (
        <span className={t.errors ? 'font-medium text-bad' : 'text-muted'}>
          {t.errors ? `${t.errors} · ${fmtPct(errRate(t), 0)}` : '—'}
        </span>
      ),
    },
    { key: 'p95', header: 'p95', align: 'right', sortBy: (t) => t.p95_ms, cell: (t) => <span className="font-mono font-medium">{fmtMs(t.p95_ms)}</span> },
    { key: 'avg', header: 'Avg', align: 'right', sortBy: (t) => t.avg_ms, cell: (t) => <span className="font-mono text-muted">{fmtMs(t.avg_ms)}</span> },
    { key: 'bytes', header: 'Output', align: 'right', sortBy: (t) => t.bytes, cell: (t) => <span className="font-mono text-muted">{fmtNum(t.bytes)}B</span> },
    {
      key: 'trend',
      header: 'Latency trend',
      width: '130px',
      cell: (t) => <Sparkline values={trend.get(t.name) ?? []} color={errRate(t) > 5 ? 'rgb(var(--bad))' : 'rgb(var(--accent))'} />,
    },
  ];
}

const ERROR_COLUMNS: Array<Column<ErrorRow>> = [
  { key: 'name', header: 'Tool', sortBy: (e) => e.name, cell: (e) => <Chip>{e.name}</Chip> },
  {
    key: 'where',
    header: 'Run',
    sortBy: (e) => `${e.owner}/${e.repo}`,
    cell: (e) => <Stacked top={`${e.owner}/${e.repo}`} bottom={`${e.flow} · turn ${e.turn_idx} · ${e.phase}`} />,
  },
  {
    key: 'args',
    header: 'Called with',
    width: '260px',
    cell: (e) => <div className="max-w-[260px] truncate"><Mono>{e.args_preview ?? '—'}</Mono></div>,
  },
  {
    key: 'error',
    header: 'What it said',
    width: '320px',
    cell: (e) => <div className="max-w-[320px] truncate text-bad">{e.error ?? 'failed'}</div>,
  },
  { key: 'took', header: 'Took', align: 'right', sortBy: (e) => e.duration_ms, cell: (e) => <span className="font-mono">{fmtMs(e.duration_ms)}</span> },
  { key: 'when', header: 'When', align: 'right', sortBy: (e) => e.started_at, cell: (e) => <span className="text-muted">{fmtAgo(e.started_at)}</span> },
];

function ToolsBody({ ctx }: { ctx: DashboardContext }) {
  const [selected, setSelected] = useState<string>('');
  const [openRun, setOpenRun] = useState<string | null>(null);
  const deps = [JSON.stringify(ctx.params), ctx.tick];

  const tools = useUsage<ToolRow[]>('api/tools', ctx.params, deps);
  const trend = useUsage<TrendRow[]>('api/tools/trend', ctx.params, deps);
  const errors = useUsage<ErrorRow[]>('api/tools/errors', { ...ctx.params, ...(selected ? { name: selected } : {}), limit: 80 }, [
    ...deps,
    selected,
  ]);

  useEffect(() => ctx.setLoading(tools.loading), [tools.loading, ctx]);
  useEffect(() => {
    const n = (tools.data ?? []).reduce((a, t) => a + Number(t.calls), 0);
    ctx.setNote(n ? `${fmtNum(n)} tool calls` : '');
  }, [tools.data, ctx]);

  const trendByTool = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of trend.data ?? []) m.set(r.name, [...(m.get(r.name) ?? []), Number(r.avg_ms)]);
    return m;
  }, [trend.data]);

  const rows = tools.data ?? [];
  const totals = useMemo(() => {
    const calls = rows.reduce((a, t) => a + Number(t.calls), 0);
    const errs = rows.reduce((a, t) => a + Number(t.errors), 0);
    return { calls, errs, rate: calls ? (errs / calls) * 100 : 0 };
  }, [rows]);

  if (tools.error) return <Empty title="Could not load tool statistics">{tools.error.message}</Empty>;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <span className="block text-[11px] uppercase tracking-[0.07em] text-faint">Tool calls</span>
          <b className="text-[21px] font-semibold tabular-nums">{fmtNum(totals.calls)}</b>
        </Card>
        <Card>
          <span className="block text-[11px] uppercase tracking-[0.07em] text-faint">Failures</span>
          <b className={`text-[21px] font-semibold tabular-nums ${totals.errs ? 'text-bad' : ''}`}>{fmtNum(totals.errs)}</b>
        </Card>
        <Card>
          <span className="block text-[11px] uppercase tracking-[0.07em] text-faint">Error rate</span>
          <b className="text-[21px] font-semibold tabular-nums">{fmtPct(totals.rate)}</b>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card title="Every tool" hint="Select a row to filter the failures below">
          <Table
            rows={rows}
            columns={toolColumns(trendByTool)}
            rowKey={(t) => t.name}
            onRowClick={(t) => setSelected(selected === t.name ? '' : t.name)}
            accent={(t) => (t.name === selected ? 'rgb(var(--accent))' : errRate(t) > 5 ? 'rgb(var(--bad) / 0.6)' : undefined)}
            defaultSort="-calls"
            loading={tools.loading}
            empty={{ title: 'No tool calls', body: 'Nothing in this window used a tool.' }}
          />
        </Card>

        <Card title="Share of calls" hint="Which tools the agent actually reaches for">
          <BarList
            rows={rows.slice(0, 9).map((t) => ({ key: t.name, value: Number(t.calls), note: fmtNum(t.calls) }))}
            format={fmtNum}
          />
        </Card>
      </div>

      <Card
        title={selected ? `Failures — ${selected}` : 'Failures'}
        hint="What the tool said, and the run it said it on"
        action={
          selected ? (
            <button onClick={() => setSelected('')} className="rounded-[9px] border border-line/[0.12] px-3 py-1.5 text-[12.5px] text-muted hover:text-text">
              Clear filter
            </button>
          ) : undefined
        }
      >
        <Table
          rows={errors.data ?? []}
          columns={ERROR_COLUMNS}
          rowKey={(e, i) => `${e.run_id}-${i}`}
          onRowClick={(e) => setOpenRun(e.run_id)}
          accent={() => 'rgb(var(--bad) / 0.7)'}
          loading={errors.loading}
          empty={{ title: 'Nothing failed', body: 'No tool call failed in this window. That is the good outcome.' }}
        />
      </Card>

      <RunDrawer id={openRun} onClose={() => setOpenRun(null)} />
    </>
  );
}

export function ToolsPage() {
  return <DashboardLayout>{(ctx) => <ToolsBody ctx={ctx} />}</DashboardLayout>;
}
