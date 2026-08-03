import { useEffect, useMemo } from 'react';
import { Card } from '../../sections/dashboard/Shell';
import { DashboardLayout, type DashboardContext } from '../../sections/dashboard/Layout';
import { BarList, ComboChart, Donut, Empty } from '../../sections/dashboard/charts';
import { Chip, Table, type Column } from '../../sections/dashboard/Table';
import { useUsage, type DayRow, type GroupRow } from '../../lib/usage';
import { fmtNum, fmtUsd } from '../../lib/format';

/**
 * What sets the agent off.
 *
 * Every run has a trigger — the webhook event, the slash command, the schedule,
 * the CLI. This page groups by that, which is the view you want when deciding
 * what to turn off: the expensive thing is usually one trigger, not one repo.
 */

/** A trigger reads as `pull_request.opened`; say which half is which. */
function triggerLabel(key: string): { event: string; action: string } {
  const [event, action] = key.split('.');
  return { event: event ?? key, action: action ?? '' };
}

function eventColumns(totalRuns: number): Array<Column<GroupRow>> {
  const perRun = (r: GroupRow) => (Number(r.runs) ? Number(r.usd) / Number(r.runs) : 0);
  return [
    { key: 'event', header: 'Event', sortBy: (r) => r.key, cell: (r) => <Chip>{triggerLabel(r.key).event}</Chip> },
    { key: 'action', header: 'Action', sortBy: (r) => r.key, cell: (r) => <span className="text-muted">{triggerLabel(r.key).action || '—'}</span> },
    { key: 'runs', header: 'Runs', align: 'right', sortBy: (r) => Number(r.runs), cell: (r) => fmtNum(r.runs) },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      sortBy: (r) => Number(r.runs),
      cell: (r) => <span className="text-muted">{(totalRuns ? (Number(r.runs) / totalRuns) * 100 : 0).toFixed(1)}%</span>,
    },
    {
      key: 'failed',
      header: 'Failed',
      align: 'right',
      sortBy: (r) => Number(r.failed),
      cell: (r) => <span className={Number(r.failed) ? 'font-medium text-bad' : 'text-muted'}>{Number(r.failed) || '—'}</span>,
    },
    { key: 'tokens', header: 'Tokens', align: 'right', sortBy: (r) => Number(r.tokens), cell: (r) => <span className="font-mono text-muted">{fmtNum(r.tokens)}</span> },
    { key: 'spend', header: 'Spend', align: 'right', sortBy: (r) => Number(r.usd), cell: (r) => <span className="font-mono font-medium">{fmtUsd(r.usd)}</span> },
    { key: 'perrun', header: 'Per run', align: 'right', sortBy: perRun, cell: (r) => <span className="font-mono text-muted">{fmtUsd(perRun(r), true)}</span> },
  ];
}

function EventsBody({ ctx }: { ctx: DashboardContext }) {
  const deps = [JSON.stringify(ctx.params), ctx.tick];
  const triggers = useUsage<GroupRow[]>('api/breakdown', { ...ctx.params, by: 'trigger' }, deps);
  const surfaces = useUsage<GroupRow[]>('api/breakdown', { ...ctx.params, by: 'surface' }, deps);
  const flows = useUsage<GroupRow[]>('api/breakdown', { ...ctx.params, by: 'flow' }, deps);
  const actors = useUsage<GroupRow[]>('api/breakdown', { ...ctx.params, by: 'actor' }, deps);
  const stops = useUsage<GroupRow[]>('api/breakdown', { ...ctx.params, by: 'stopped_by' }, deps);
  const daily = useUsage<DayRow[]>('api/daily', ctx.params, deps);

  useEffect(() => ctx.setLoading(triggers.loading), [triggers.loading, ctx]);
  useEffect(() => {
    const n = (triggers.data ?? []).length;
    ctx.setNote(n ? `${n} distinct triggers` : '');
  }, [triggers.data, ctx]);

  const rows = useMemo(
    () => (triggers.data ?? []).slice().sort((a, b) => Number(b.runs) - Number(a.runs)),
    [triggers.data],
  );
  const totalRuns = rows.reduce((a, r) => a + Number(r.runs), 0);

  if (triggers.error) return <Empty title="Could not load events">{triggers.error.message}</Empty>;

  return (
    <>
      <Card title="When the agent ran" hint="Bars are runs, the line is cost">
        <ComboChart
          points={(daily.data ?? []).map((d) => ({
            label: d.day,
            bar: Number(d.runs),
            line: Number(d.usd),
            extra: `${fmtNum(d.tokens)} tokens${Number(d.failed) ? ` · ${d.failed} failed` : ''}`,
          }))}
          barName="runs"
          lineName="cost"
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="By surface" hint="App webhook, workflow, or command line">
          <Donut
            slices={(surfaces.data ?? []).map((s) => ({ key: s.key, value: Number(s.runs) }))}
            total={(surfaces.data ?? []).reduce((a, s) => a + Number(s.runs), 0)}
            label="Runs"
            format={fmtNum}
          />
        </Card>
        <Card title="By flow" hint="What the run was for">
          <BarList
            rows={(flows.data ?? [])
              .slice()
              .sort((a, b) => Number(b.runs) - Number(a.runs))
              .slice(0, 8)
              .map((f) => ({ key: f.key, value: Number(f.runs), note: `${f.runs} · ${fmtUsd(f.usd)}` }))}
            format={fmtNum}
          />
        </Card>
        <Card title="How runs ended" hint="A capped run is a truncated answer">
          <BarList
            rows={(stops.data ?? []).map((s) => ({
              key: s.key === 'end' ? 'finished' : s.key === 'limit' ? 'hit iteration limit' : s.key === 'budget' ? 'hit spend cap' : s.key,
              value: Number(s.runs),
              note: `${s.runs} runs`,
            }))}
            format={fmtNum}
          />
        </Card>
      </div>

      <Card title="Every trigger" hint="Each distinct event that started a run in this window">
        <Table
          rows={rows}
          columns={eventColumns(totalRuns)}
          rowKey={(r) => r.key}
          defaultSort="-runs"
          loading={triggers.loading}
          empty={{ title: 'No events yet', body: 'Nothing has triggered the agent in this window.' }}
        />
      </Card>

      <Card title="Who set it off" hint="The account behind each run — bots included">
        <BarList
          rows={(actors.data ?? [])
            .slice()
            .sort((a, b) => Number(b.runs) - Number(a.runs))
            .slice(0, 10)
            .map((a) => ({ key: a.key, value: Number(a.runs), note: `${a.runs} runs · ${fmtUsd(a.usd)}` }))}
          format={fmtNum}
        />
      </Card>
    </>
  );
}

export function EventsPage() {
  return <DashboardLayout>{(ctx) => <EventsBody ctx={ctx} />}</DashboardLayout>;
}
