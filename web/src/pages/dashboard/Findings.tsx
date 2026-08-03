import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../sections/dashboard/Shell';
import { DashboardLayout, type DashboardContext } from '../../sections/dashboard/Layout';
import { BarList, Donut, Empty } from '../../sections/dashboard/charts';
import { Mono, Stacked, Table, type Column } from '../../sections/dashboard/Table';
import { RunDrawer } from '../../sections/dashboard/RunDrawer';
import { useUsage } from '../../lib/usage';
import { fmtAgo, fmtNum } from '../../lib/format';

/**
 * Everything the review and audit flows reported.
 *
 * Counts by severity are the summary; this is the list. Pre-existing findings
 * are marked rather than hidden — they are the ones a review deliberately did
 * not block on, and they are worth seeing accumulate.
 */

interface FindingRow {
  id: string;
  file: string;
  line: number | null;
  lens: string;
  severity: string;
  category: string | null;
  title: string;
  pre_existing: number;
  posted_inline: number;
  owner: string;
  repo: string;
  flow: string;
  started_at: number;
  run_id: string;
  result_url: string | null;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const COLORS: Record<string, string> = {
  critical: 'rgb(var(--bad))',
  high: 'rgb(var(--accent-warm))',
  medium: 'rgb(var(--warn))',
  low: 'rgb(var(--info))',
  info: 'rgb(var(--muted))',
};
const tone = (s: string) =>
  s === 'critical' || s === 'high' ? 'text-bad' : s === 'medium' ? 'text-warn' : 'text-muted';

const COLUMNS: Array<Column<FindingRow>> = [
  {
    key: 'severity',
    header: 'Severity',
    sortBy: (f) => SEVERITIES.indexOf(f.severity),
    cell: (f) => <span className={`text-[11.5px] font-semibold uppercase ${tone(f.severity)}`}>{f.severity}</span>,
  },
  {
    key: 'title',
    header: 'Finding',
    width: '380px',
    sortBy: (f) => f.title,
    cell: (f) => (
      <div className="max-w-[380px]">
        <Stacked
          top={f.title}
          bottom={`${f.lens}${f.category ? ` · ${f.category}` : ''}${f.pre_existing ? ' · pre-existing' : ''}`}
        />
      </div>
    ),
  },
  {
    key: 'file',
    header: 'Where',
    width: '240px',
    sortBy: (f) => f.file,
    cell: (f) => (
      <div className="max-w-[240px] truncate">
        <Mono>
          {f.file}
          {f.line ? `:${f.line}` : ''}
        </Mono>
      </div>
    ),
  },
  {
    key: 'repo',
    header: 'Repository',
    sortBy: (f) => `${f.owner}/${f.repo}`,
    cell: (f) => <Stacked top={`${f.owner}/${f.repo}`} bottom={f.flow} />,
  },
  { key: 'posted', header: 'Posted', cell: (f) => <span className="text-muted">{f.posted_inline ? 'inline' : 'summary'}</span> },
  {
    key: 'when',
    header: 'When',
    align: 'right',
    sortBy: (f) => f.started_at,
    cell: (f) => <span className="text-muted">{fmtAgo(f.started_at)}</span>,
  },
];

function FindingsBody({ ctx }: { ctx: DashboardContext }) {
  const [severity, setSeverity] = useState('');
  const [openRun, setOpenRun] = useState<string | null>(null);
  const deps = [JSON.stringify(ctx.params), ctx.tick];

  const stats = useUsage<Array<{ severity: string; lens: string; n: number; pre_existing: number; posted: number }>>(
    'api/findings',
    ctx.params,
    deps,
  );
  const list = useUsage<FindingRow[]>(
    'api/findings/list',
    { ...ctx.params, ...(severity ? { severity } : {}), limit: 200 },
    [...deps, severity],
  );

  useEffect(() => ctx.setLoading(list.loading), [list.loading, ctx]);
  useEffect(() => {
    const n = (stats.data ?? []).reduce((a, s) => a + Number(s.n), 0);
    ctx.setNote(n ? `${fmtNum(n)} findings` : '');
  }, [stats.data, ctx]);

  const bySeverity = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stats.data ?? []) m.set(s.severity, (m.get(s.severity) ?? 0) + Number(s.n));
    return SEVERITIES.filter((s) => m.has(s)).map((s) => ({ key: s, value: m.get(s)! }));
  }, [stats.data]);

  const byLens = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stats.data ?? []) m.set(s.lens, (m.get(s.lens) ?? 0) + Number(s.n));
    return [...m].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, value, note: String(value) }));
  }, [stats.data]);

  const byFile = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of list.data ?? []) m.set(f.file, (m.get(f.file) ?? 0) + 1);
    return [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => ({ key, value, note: `${value}` }));
  }, [list.data]);

  if (stats.error) return <Empty title="Could not load findings">{stats.error.message}</Empty>;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="By severity" hint="Select a slice to filter the list">
          {bySeverity.length ? (
            <Donut
              slices={bySeverity}
              total={bySeverity.reduce((a, s) => a + s.value, 0)}
              label="Findings"
              format={fmtNum}
              colorOf={(k) => COLORS[k] ?? 'rgb(var(--muted))'}
            />
          ) : (
            <Empty>Nothing reported in this window.</Empty>
          )}
        </Card>
        <Card title="By lens" hint="Which pass reported it">
          <BarList rows={byLens} format={fmtNum} />
        </Card>
        <Card title="Hot files" hint="Where findings keep landing">
          <BarList rows={byFile} format={fmtNum} />
        </Card>
      </div>

      <Card
        title="Findings"
        hint="Newest first · select a row to open the run that reported it"
        action={
          <div className="inline-flex gap-0.5 rounded-[10px] border border-line/[0.08] bg-panel/80 p-[3px]">
            <button
              onClick={() => setSeverity('')}
              className={`rounded-[7px] px-2.5 py-1 text-[12px] ${severity === '' ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}
            >
              All
            </button>
            {bySeverity.map((s) => (
              <button
                key={s.key}
                onClick={() => setSeverity(s.key)}
                className={`rounded-[7px] px-2.5 py-1 text-[12px] capitalize ${
                  severity === s.key ? 'bg-accent text-white' : 'text-muted hover:text-text'
                }`}
              >
                {s.key}
              </button>
            ))}
          </div>
        }
      >
        <Table
          rows={list.data ?? []}
          columns={COLUMNS}
          rowKey={(f, i) => `${f.run_id}-${i}`}
          onRowClick={(f) => setOpenRun(f.run_id)}
          accent={(f) => COLORS[f.severity]}
          defaultSort="severity"
          loading={list.loading}
          empty={{ title: 'No findings match', body: 'Nothing was reported at this severity in this window.' }}
        />
      </Card>

      <RunDrawer id={openRun} onClose={() => setOpenRun(null)} />
    </>
  );
}

export function FindingsPage() {
  return <DashboardLayout>{(ctx) => <FindingsBody ctx={ctx} />}</DashboardLayout>;
}
