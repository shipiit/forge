import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../sections/dashboard/Shell';
import { DashboardLayout, type DashboardContext } from '../../sections/dashboard/Layout';
import { RunsTable } from '../../sections/dashboard/Tables';
import { RunDrawer } from '../../sections/dashboard/RunDrawer';
import { Empty } from '../../sections/dashboard/charts';
import { fetchUsage, type RunRow, type Summary } from '../../lib/usage';
import { fmtMs, fmtNum, fmtUsd } from '../../lib/format';

/**
 * The whole run log.
 *
 * The overview shows the last fifty; this is the page you come to when you need
 * the one from Tuesday. It pages through with a cursor rather than an offset —
 * runs arrive while you are reading, and an offset would show you the same row
 * twice and skip another.
 */

const PAGE = 100;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/[0.08] bg-panel px-4 py-3">
      <span className="block text-[11px] uppercase tracking-[0.07em] text-faint">{label}</span>
      <b className="text-[17px] font-semibold tabular-nums">{value}</b>
    </div>
  );
}

function RunsBody({ ctx }: { ctx: DashboardContext }) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [openRun, setOpenRun] = useState<string | null>(null);
  const key = JSON.stringify(ctx.params) + ctx.tick;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setDone(false);
    Promise.all([
      fetchUsage<RunRow[]>('api/runs', { ...ctx.params, limit: PAGE }),
      fetchUsage<Summary>('api/summary', ctx.params),
    ])
      .then(([r, s]) => {
        if (!live) return;
        setRows(r);
        setSummary(s);
        setDone(r.length < PAGE);
        setError(undefined);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => ctx.setLoading(loading), [loading, ctx]);
  useEffect(() => ctx.setNote(rows.length ? `${rows.length} loaded` : ''), [rows.length, ctx]);

  const more = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const next = await fetchUsage<RunRow[]>('api/runs', { ...ctx.params, limit: PAGE, before: last.id });
      setRows((r) => [...r, ...next]);
      setDone(next.length < PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    const spend = rows.reduce((a, r) => a + Number(r.usd), 0);
    const finished = rows.filter((r) => r.ended_at);
    const avg = finished.length ? finished.reduce((a, r) => a + (r.ended_at! - r.started_at), 0) / finished.length : 0;
    return { spend, avg };
  }, [rows]);

  if (error) return <Empty title="Could not load the run log">{error}</Empty>;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Runs in window" value={fmtNum(summary?.runs ?? 0)} />
        <Stat label="Spend in window" value={fmtUsd(summary?.usd ?? 0)} />
        <Stat label="Loaded here" value={`${rows.length}${done ? '' : '+'}`} />
        <Stat label="Average duration" value={fmtMs(totals.avg)} />
      </div>

      <Card title="Run log" hint="Newest first · select a row for the turn-by-turn breakdown">
        {loading && !rows.length ? (
          <div className="grid gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-line/[0.05]" />
            ))}
          </div>
        ) : (
          <RunsTable rows={rows} onOpen={setOpenRun} />
        )}

        {rows.length > 0 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px] text-muted">
            {done ? (
              <span>That is every run in this window.</span>
            ) : (
              <button
                onClick={more}
                disabled={loading}
                className="rounded-[9px] border border-line/[0.12] px-4 py-2 text-text transition-colors hover:bg-line/[0.05] disabled:opacity-50"
              >
                {loading ? 'Loading…' : `Load ${PAGE} more`}
              </button>
            )}
          </div>
        )}
      </Card>

      <RunDrawer id={openRun} onClose={() => setOpenRun(null)} />
    </>
  );
}

export function RunsPage() {
  return <DashboardLayout>{(ctx) => <RunsBody ctx={ctx} />}</DashboardLayout>;
}
