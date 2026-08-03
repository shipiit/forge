import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../sections/dashboard/Shell';
import { DashboardLayout, type DashboardContext } from '../sections/dashboard/Layout';
import { Kpis } from '../sections/dashboard/Kpis';
import { BarList, ComboChart, Donut, Empty } from '../sections/dashboard/charts';
import { RunsTable, ToolTable } from '../sections/dashboard/Tables';
import { RunDrawer } from '../sections/dashboard/RunDrawer';
import { fmtNum, fmtUsd, shortModel } from '../lib/format';
import { useUsage, type DayRow, type GroupRow, type RunRow, type Summary, type ToolRow } from '../lib/usage';

interface TrendRow {
  name: string;
  day: string;
  avg_ms: number;
}

function Overview({ ctx }: { ctx: DashboardContext }) {
  const [openRun, setOpenRun] = useState<string | null>(null);
  const { params, filters } = ctx;
  const deps = [JSON.stringify(params), ctx.tick];

  const summary = useUsage<Summary>('api/summary', params, deps);
  // The same window, slid back by its own length: that is what "vs the period
  // before" has to mean for the comparison to be honest.
  const previous = useUsage<Summary>('api/summary', { ...params, shift: filters.days }, deps);
  const daily = useUsage<DayRow[]>('api/daily', params, deps);
  const flows = useUsage<GroupRow[]>('api/breakdown', { ...params, by: 'flow' }, deps);
  const models = useUsage<GroupRow[]>('api/breakdown', { ...params, by: 'model' }, deps);
  const repos = useUsage<GroupRow[]>('api/breakdown', { ...params, by: 'repo' }, deps);
  const tools = useUsage<ToolRow[]>('api/tools', params, deps);
  const toolTrend = useUsage<TrendRow[]>('api/tools/trend', params, deps);
  const findings = useUsage<Array<{ severity: string; lens: string; n: number }>>('api/findings', params, deps);
  const runs = useUsage<RunRow[]>('api/runs', { ...params, limit: 50 }, deps);
  const error = summary.error;
  useEffect(() => ctx.setLoading(summary.loading || runs.loading), [summary.loading, runs.loading, ctx]);
  useEffect(() => {
    ctx.setNote(summary.data ? `${summary.data.runs} runs in view` : '');
  }, [summary.data, ctx]);

  const days = daily.data ?? [];
  const trendByTool = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of toolTrend.data ?? []) m.set(r.name, [...(m.get(r.name) ?? []), Number(r.avg_ms)]);
    return m;
  }, [toolTrend.data]);

  const severities = useMemo(() => {
    // Ordered by how much they matter, not by count — a chart of findings that
    // puts "low" first is answering the wrong question.
    const order = ['critical', 'high', 'medium', 'low', 'info'];
    const m = new Map<string, number>();
    for (const f of findings.data ?? []) m.set(f.severity, (m.get(f.severity) ?? 0) + Number(f.n));
    return order.filter((s) => m.has(s)).map((s) => ({ key: s, value: m.get(s)! }));
  }, [findings.data]);

  if (error) {
    return (
      <Empty title={error.status === 401 ? 'Not authorized' : 'Cannot reach the usage API'}>
        {error.message} Open <b>Connection</b> in the sidebar to point this at your agent.
      </Empty>
    );
  }

  return (
    <>
          <div id="overview" className="scroll-mt-20">
            <Kpis now={summary.data} before={previous.data} days={days} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card id="spend" title="Spend & volume" hint="Bars are runs, the line is cost">
              <ComboChart
                points={days.map((d) => ({
                  label: d.day,
                  bar: Number(d.runs),
                  line: Number(d.usd),
                  extra: `${fmtNum(d.tokens)} tokens${Number(d.failed) ? ` · ${d.failed} failed` : ''}`,
                }))}
                barName="runs"
                lineName="cost"
              />
            </Card>

            <Card id="flows" title="Spend by flow" hint="Where the money goes">
              <Donut
                slices={(flows.data ?? []).slice(0, 6).map((f) => ({ key: f.key, value: Number(f.usd) }))}
                total={(flows.data ?? []).slice(0, 6).reduce((a, f) => a + Number(f.usd), 0)}
                label="Total"
                format={(n) => fmtUsd(n)}
              />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card id="models" title="Spend by model" hint="Cost per model">
              <Donut
                slices={(models.data ?? []).slice(0, 5).map((m) => ({ key: shortModel(m.key), value: Number(m.usd) }))}
                total={(models.data ?? []).slice(0, 5).reduce((a, m) => a + Number(m.usd), 0)}
                label="Total"
                format={(n) => fmtUsd(n)}
              />
            </Card>

            <Card id="repos" title="By repository" hint="Busiest first">
              <BarList
                rows={(repos.data ?? [])
                  .slice()
                  .sort((a, b) => Number(b.runs) - Number(a.runs))
                  .slice(0, 7)
                  .map((r) => ({ key: r.key, value: Number(r.runs), note: `${r.runs} runs · ${fmtUsd(r.usd)}` }))}
                format={fmtNum}
              />
            </Card>

            <Card id="cache" title="Cache & tokens" hint="What prompt caching is actually saving">
              {summary.data ? <CachePanel s={summary.data} /> : <div className="h-32 animate-pulse rounded-xl bg-line/[0.05]" />}
            </Card>
          </div>

          <Card
            id="tools"
            title="Tool reliability"
            hint="p95, not average — the slow tail is the story"
            action={
              <Link to="/dashboard/tools" className="whitespace-nowrap rounded-[9px] border border-line/[0.12] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:text-text">
                Every tool →
              </Link>
            }
          >
            <ToolTable rows={tools.data ?? []} trend={trendByTool} />
          </Card>

          <Card
            id="findings"
            title="Findings by severity"
            hint="What the review and audit flows reported"
            action={
              <Link to="/dashboard/findings" className="whitespace-nowrap rounded-[9px] border border-line/[0.12] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:text-text">
                Every finding →
              </Link>
            }
          >
            {severities.length ? (
              <Donut
                slices={severities}
                total={severities.reduce((a, s) => a + s.value, 0)}
                label="Findings"
                format={(n) => fmtNum(n)}
                colorOf={severityColor}
              />
            ) : (
              <Empty>No findings recorded in this window.</Empty>
            )}
          </Card>

          <Card
            id="runs"
            title="Recent runs"
            hint="Select a row for the turn-by-turn breakdown"
            action={
              <Link
                to={`/dashboard/runs${filters.days !== 30 ? `?days=${filters.days}` : ''}`}
                className="whitespace-nowrap rounded-[9px] border border-line/[0.12] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:text-text"
              >
                View all runs →
              </Link>
            }
          >
            <RunsTable rows={(runs.data ?? []).slice(0, 15)} onOpen={setOpenRun} />
          </Card>

      <RunDrawer id={openRun} onClose={() => setOpenRun(null)} />
    </>
  );
}

export function Dashboard() {
  return <DashboardLayout>{(ctx) => <Overview ctx={ctx} />}</DashboardLayout>;
}

/** Severity has its own meaning; it must not ride the generic series palette. */
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'rgb(var(--bad))',
  high: 'rgb(var(--accent-warm))',
  medium: 'rgb(var(--warn))',
  low: 'rgb(var(--info))',
  info: 'rgb(var(--muted))',
};
const severityColor = (key: string) => SEVERITY_COLORS[key] ?? 'rgb(var(--muted))';

/** The cache story: how much was reused, and what that reuse was worth. */
function CachePanel({ s }: { s: Summary }) {
  const fresh = s.inputTokens;
  const reused = s.cacheRead;
  const hit = fresh + reused ? (reused / (fresh + reused)) * 100 : 0;
  return (
    <div className="grid gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[12.5px] text-muted">Cache hit rate</span>
          <b className="text-[19px] font-semibold tabular-nums">{hit.toFixed(1)}%</b>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/[0.06]">
          <span className="block h-full rounded-full bg-gradient-to-r from-forge1 to-forge2" style={{ width: `${hit}%` }} />
        </div>
      </div>
      <BarList
        rows={[
          { key: 'Cache read', value: reused, note: fmtNum(reused) },
          { key: 'Fresh input', value: fresh, note: fmtNum(fresh) },
          { key: 'Cache write', value: s.cacheWrite, note: fmtNum(s.cacheWrite) },
          { key: 'Output', value: s.outputTokens, note: fmtNum(s.outputTokens) },
        ]}
        format={fmtNum}
      />
      <div className="rounded-xl border border-ok/20 bg-ok/[0.08] px-3 py-2.5 text-[12.5px]">
        Caching saved <b className="text-ok">{fmtUsd(s.saved)}</b> against {fmtUsd(s.usdUncached)} uncached.
      </div>
    </div>
  );
}
