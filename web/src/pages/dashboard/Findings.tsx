import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../sections/dashboard/Shell';
import { DashboardLayout, type DashboardContext } from '../../sections/dashboard/Layout';
import { BarList, Donut, Empty } from '../../sections/dashboard/charts';
import { ruleLabel } from '../../lib/cwe';
import { Mono, Stacked, Table, type Column } from '../../sections/dashboard/Table';
import { RunDrawer } from '../../sections/dashboard/RunDrawer';
import { FindingDrawer } from '../../sections/dashboard/FindingDrawer';
import { Pager } from '../../sections/dashboard/Pager';
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

const PAGE = 50;

function FindingsBody({ ctx }: { ctx: DashboardContext }) {
  const [severity, setSeverity] = useState('');
  const [page, setPage] = useState(0);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const deps = [JSON.stringify(ctx.params), ctx.tick];

  const stats = useUsage<Array<{ severity: string; lens: string; n: number; pre_existing: number; posted: number }>>(
    'api/findings',
    ctx.params,
    deps,
  );
  // One page for the table, one wider sample for the rule and file charts —
  // the charts describe the window, not whichever page is showing.
  const list = useUsage<FindingRow[]>(
    'api/findings/list',
    { ...ctx.params, ...(severity ? { severity } : {}), limit: PAGE, offset: page * PAGE },
    [...deps, severity, page],
  );
  const sample = useUsage<FindingRow[]>('api/findings/list', { ...ctx.params, limit: 500 }, deps);
  useEffect(() => setPage(0), [severity, ...deps]);

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

  // Rules, not lenses, are what a reader acts on: which kind of problem keeps coming back.
  const byRule = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of sample.data ?? []) m.set(ruleLabel(f.category), (m.get(ruleLabel(f.category)) ?? 0) + 1);
    return [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => ({ key, value, note: `${value}` }));
  }, [sample.data]);

  const byFile = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of sample.data ?? []) m.set(f.file, (m.get(f.file) ?? 0) + 1);
    return [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => ({ key, value, note: `${value}` }));
  }, [sample.data]);

  const total = severity ? (bySeverity.find((s) => s.key === severity)?.value ?? 0) : bySeverity.reduce((a, s) => a + s.value, 0);

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
        <Card
          title="Top rules"
          hint={byLens.length ? `What keeps coming back · ${byLens.map((l) => `${l.key} ${l.value}`).join(' · ')}` : 'What keeps coming back'}
        >
          <BarList rows={byRule} format={fmtNum} />
        </Card>
        <Card title="Hot files" hint="Where findings keep landing">
          <BarList rows={byFile} format={fmtNum} />
        </Card>
      </div>

      <Card
        title="Findings"
        hint="Newest first · select a finding for its explanation and fix"
        action={
          <div className="inline-flex gap-0.5 rounded-[10px] border border-line/[0.08] bg-panel/80 p-[3px]">
            <button
              onClick={() => setSeverity('')}
              className={`rounded-[7px] px-2.5 py-1 text-[12px] ${severity === '' ? 'bg-accent text-black' : 'text-muted hover:text-text'}`}
            >
              All
            </button>
            {bySeverity.map((s) => (
              <button
                key={s.key}
                onClick={() => setSeverity(s.key)}
                className={`rounded-[7px] px-2.5 py-1 text-[12px] capitalize ${
                  severity === s.key ? 'bg-accent text-black' : 'text-muted hover:text-text'
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
          onRowClick={(f) => setOpenFinding(f.id)}
          accent={(f) => COLORS[f.severity]}
          defaultSort="severity"
          loading={list.loading}
          empty={{ title: 'No findings match', body: 'Nothing was reported at this severity in this window.' }}
        />
        <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} noun="findings" />
      </Card>

      <FindingDrawer
        id={openFinding}
        onClose={() => setOpenFinding(null)}
        onOpenRun={(runId) => {
          setOpenFinding(null);
          setOpenRun(runId);
        }}
      />
      <RunDrawer id={openRun} onClose={() => setOpenRun(null)} />
    </>
  );
}

export function FindingsPage() {
  return <DashboardLayout>{(ctx) => <FindingsBody ctx={ctx} />}</DashboardLayout>;
}
