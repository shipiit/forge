import { Sparkline } from './charts';
import { Chip, Mono, Stacked, Table, type Column } from './Table';
import { fmtAgo, fmtMs, fmtNum, fmtPct, fmtUsd, shortModel } from '../../lib/format';
import type { RunRow, ToolRow } from '../../lib/usage';

/** Status as a dot and a word. Boxes on every row make a long table shout. */
export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'ok' ? 'text-ok' : status === 'failed' ? 'text-bad' : status === 'running' ? 'text-info' : 'text-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${tone}`}>
      <i className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'running' ? 'animate-dotpulse' : ''}`} />
      {status}
    </span>
  );
}

export const STATUS_COLOR: Record<string, string> = {
  ok: 'rgb(var(--ok) / 0.55)',
  failed: 'rgb(var(--bad))',
  running: 'rgb(var(--info))',
  skipped: 'rgb(var(--muted) / 0.4)',
};

export function RunsTable({ rows, onOpen, loading }: { rows: RunRow[]; onOpen: (id: string) => void; loading?: boolean }) {
  const tokens = (r: RunRow) => Number(r.input_tokens) + Number(r.output_tokens) + Number(r.cache_read);
  const took = (r: RunRow) => (r.ended_at ? r.ended_at - r.started_at : 0);

  const columns: Array<Column<RunRow>> = [
    {
      key: 'run',
      header: 'Run',
      sortBy: (r) => r.started_at,
      cell: (r) => (
        <Stacked
          top={<Mono tone="accent">run_{r.id.slice(-8)}</Mono>}
          bottom={
            <>
              {r.flow}
              {r.actor ? ` · ${r.actor}` : ''}
            </>
          }
        />
      ),
    },
    {
      key: 'repo',
      header: 'Repository',
      sortBy: (r) => `${r.owner}/${r.repo}`,
      cell: (r) => (
        <Stacked
          top={
            <>
              {r.owner}/<span className="font-medium">{r.repo}</span>
            </>
          }
          bottom={r.pr_number ? `PR #${r.pr_number}` : r.issue_number ? `Issue #${r.issue_number}` : r.trigger}
        />
      ),
    },
    { key: 'model', header: 'Model', sortBy: (r) => r.model, cell: (r) => <span className="text-muted">{shortModel(r.model)}</span> },
    { key: 'status', header: 'Status', sortBy: (r) => r.status, cell: (r) => <StatusPill status={r.status} /> },
    { key: 'turns', header: 'Turns', align: 'right', sortBy: (r) => r.iterations, cell: (r) => r.iterations },
    {
      key: 'tokens',
      header: 'Tokens',
      align: 'right',
      sortBy: tokens,
      cell: (r) => <span className="text-muted">{fmtNum(tokens(r))}</span>,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      sortBy: (r) => Number(r.usd),
      cell: (r) => <span className="font-mono font-medium">{fmtUsd(r.usd, true)}</span>,
    },
    {
      key: 'took',
      header: 'Took',
      align: 'right',
      sortBy: took,
      cell: (r) => <span className="font-mono text-muted">{r.ended_at ? fmtMs(took(r)) : '—'}</span>,
    },
    {
      key: 'started',
      header: 'Started',
      align: 'right',
      sortBy: (r) => r.started_at,
      cell: (r) => <span className="text-muted">{fmtAgo(r.started_at)}</span>,
    },
  ];

  return (
    <Table
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      accent={(r) => STATUS_COLOR[r.status]}
      {...(loading !== undefined ? { loading } : {})}
      empty={{ title: 'No runs match these filters', body: 'Clear a filter, or widen the date range.' }}
    />
  );
}

export function ToolTable({ rows, trend }: { rows: ToolRow[]; trend: Map<string, number[]> }) {
  const rate = (t: ToolRow) => (t.calls ? (t.errors / t.calls) * 100 : 0);

  const columns: Array<Column<ToolRow>> = [
    { key: 'name', header: 'Tool', sortBy: (t) => t.name, cell: (t) => <Chip>{t.name}</Chip> },
    { key: 'calls', header: 'Calls', align: 'right', sortBy: (t) => t.calls, cell: (t) => fmtNum(t.calls) },
    {
      key: 'p95',
      header: 'p95',
      align: 'right',
      sortBy: (t) => t.p95_ms,
      cell: (t) => <span className="font-mono font-medium">{fmtMs(t.p95_ms)}</span>,
    },
    {
      key: 'avg',
      header: 'Avg',
      align: 'right',
      sortBy: (t) => t.avg_ms,
      cell: (t) => <span className="font-mono text-muted">{fmtMs(t.avg_ms)}</span>,
    },
    {
      key: 'errors',
      header: 'Error rate',
      align: 'right',
      sortBy: rate,
      cell: (t) => <span className={rate(t) > 5 ? 'font-medium text-bad' : 'text-muted'}>{t.errors ? fmtPct(rate(t)) : '—'}</span>,
    },
    {
      key: 'trend',
      header: 'Trend',
      width: '120px',
      cell: (t) => <Sparkline values={trend.get(t.name) ?? []} color={rate(t) > 5 ? 'rgb(var(--bad))' : 'rgb(var(--accent))'} />,
    },
  ];

  return (
    <Table
      rows={rows}
      columns={columns}
      rowKey={(t) => t.name}
      accent={(t) => (rate(t) > 5 ? 'rgb(var(--bad) / 0.6)' : undefined)}
      defaultSort="-calls"
      empty={{ title: 'No tool calls', body: 'Nothing in this window used a tool.' }}
    />
  );
}
