import { useMemo, useRef, useState } from 'react';
import type { GameDefinition } from '../../engine/types';
import { loadRecords, loadReplays, replaysKey } from '../../shared/records';
import { replayFileName, type Replay } from '../../shared/replay';
import { saveJson } from '../../shared/storage';
import { TICK_HZ } from '../../shared/timestep';
import type { ModeId } from '../../shared/types';
import { Button, Dialog, EmptyState, IconButton, LinkButton, StatRow, Tabs } from '../components';
import { PageHeader } from '../chrome';
import { downloadJson } from '../download';
import { Icon } from '../icons';

type SortKey = 'mode' | 'best' | 'date' | 'robot';
type Row = { id: ModeId; mode: string; best: number | null; date: string | null; robot: string | null };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDur = (ticks: number) => {
  const s = Math.round(ticks / TICK_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The tab survives watching a replay (the page unmounts while the viewer is open). */
let lastTab: 'records' | 'replays' = 'records';

/** Records (career totals + sortable best scores) and saved replays. */
export function RecordsPage({ game, onWatch }: { game: GameDefinition; onWatch: (r: Replay) => void }) {
  const rec = useMemo(() => loadRecords(game.id), [game.id]);
  const [tab, setTabState] = useState<'records' | 'replays'>(lastTab);
  const setTab = (t: 'records' | 'replays') => {
    lastTab = t;
    setTabState(t);
  };
  const [replays, setReplays] = useState<Replay[]>(() => loadReplays(game.id));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'mode', dir: 1 });
  const [error, setError] = useState('');
  const [remove, setRemove] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const c = rec.career;
  const modeName = (id: string) => game.modes.find((m) => m.id === id)?.label ?? id;

  const rows: Row[] = game.modes
    .filter((m) => m.id !== 'free')
    .map((m) => {
      const b = rec.best[m.id];
      return { id: m.id, mode: m.label, best: b?.score ?? null, date: b?.date ?? null, robot: b?.robot ?? null };
    });
  const order = game.modes.map((m) => m.id);
  const sorted = [...rows].sort((a, b) => {
    const k = sort.key;
    const cmp =
      k === 'mode'
        ? order.indexOf(a.id) - order.indexOf(b.id)
        : k === 'best'
          ? (a.best ?? -Infinity) - (b.best ?? -Infinity)
          : k === 'date'
            ? (a.date ?? '').localeCompare(b.date ?? '')
            : (a.robot ?? '').localeCompare(b.robot ?? '');
    return cmp * sort.dir;
  });
  const head = (key: SortKey, label: string, num?: boolean) => {
    const on = sort.key === key;
    return (
      <th scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={num ? 'is-num' : undefined}>
        <button type="button" className="zd-sort" onClick={() => setSort({ key, dir: on ? (sort.dir === 1 ? -1 : 1) : key === 'best' || key === 'date' ? -1 : 1 })}>
          {label}
          <Icon name={on && sort.dir === -1 ? 'chevronDown' : 'chevronUp'} size="var(--icon-sm)" className={on ? 'is-on' : undefined} />
        </button>
      </th>
    );
  };

  const importFile = async (f: File) => {
    setError('');
    try {
      const r = JSON.parse(await f.text()) as Replay;
      if (r.v !== 1 || !Array.isArray(r.cmds)) throw new Error('bad');
      if (r.game !== game.id) {
        setError(`That replay is from ${r.game === 'override' ? 'Override' : 'Pinnacle'}. Switch games to open it.`);
        return;
      }
      onWatch(r);
    } catch {
      setError('That file is not a ZDrive replay.');
    }
  };

  return (
    <div className="zd-records">
      <PageHeader title="Records" eyebrow={game.name} parent={`/${game.id}`} />
      <section className="zd-career" aria-label="Career totals">
        <StatRow big label="Runs" value={c.runs} tween={false} />
        <StatRow big label="Win-loss-tie" value={`${c.wins}-${c.matches - c.wins - c.ties}-${c.ties}`} />
        <StatRow big label="Points" value={c.points} tween={false} />
        <StatRow big label="Pieces placed" value={c.placed} tween={false} />
        <StatRow big label="Match loads" value={c.loads} tween={false} />
        <StatRow big label="Time driven" value={Math.round(c.secondsDriven / 60)} unit="min" tween={false} />
        <StatRow big label="Rule calls" value={c.calls} tween={false} />
      </section>

      <Tabs
        global
        label="Records sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'records', label: 'Best scores' },
          { value: 'replays', label: `Replays (${replays.length})` },
        ]}
      />

      {tab === 'records' && (
        <div className="zd-panel zd-records-table">
          <table className="zd-table">
            <thead>
              <tr>
                {head('mode', 'Mode')}
                {head('best', 'Best', true)}
                {head('date', 'Date')}
                {head('robot', 'Robot')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.mode}</th>
                  <td className="zd-num is-num">{r.best ?? <span className="zd-muted">—</span>}</td>
                  <td>{r.date ? fmtDate(r.date) : <span className="zd-muted">No runs yet</span>}</td>
                  <td>{r.robot ?? <span className="zd-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'replays' && (
        <div className="zd-replays">
          {replays.length === 0 ? (
            <div className="zd-panel">
              <EmptyState icon="film" text="Finish a run to save its replay here." action={<LinkButton to={`/${game.id}/play`} variant="primary" icon="play">Play</LinkButton>} />
            </div>
          ) : (
            <div className="zd-panel">
              <table className="zd-table zd-replay-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Mode</th>
                    <th scope="col" className="is-num">
                      Score
                    </th>
                    <th scope="col" className="is-num">
                      Duration
                    </th>
                    <th scope="col">
                      <span className="zd-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {replays.map((r, i) => (
                    <tr key={r.date + i}>
                      <th scope="row">{fmtDateTime(r.date)}</th>
                      <td>{modeName(r.mode)}</td>
                      <td className="zd-num is-num">{r.result.player}</td>
                      <td className="zd-num is-num">{fmtDur(r.ticks)}</td>
                      <td className="zd-replay-actions">
                        <Button size="sm" variant="secondary" icon="play" onClick={() => onWatch(r)}>
                          Watch
                        </Button>
                        <IconButton size="sm" icon="download" label="Export replay" onClick={() => downloadJson(replayFileName(r), r)} />
                        <IconButton size="sm" icon="trash" label="Delete replay" onClick={() => setRemove(i)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="zd-row">
            <Button icon="upload" onClick={() => file.current?.click()}>
              Open a replay file
            </Button>
            <span className="zd-muted">The last 10 runs are kept in this browser.</span>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="zd-sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importFile(f);
              }}
            />
          </div>
          {error && (
            <div className="zd-inline-alert" role="alert">
              <Icon name="danger" />
              <span>{error}</span>
              <Button size="sm" onClick={() => file.current?.click()}>
                Choose another file
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={remove !== null}
        title="Delete this replay?"
        onClose={() => setRemove(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={() => {
                const next = replays.filter((_, k) => k !== remove);
                saveJson(replaysKey(game.id), next);
                setReplays(next);
                setRemove(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {remove !== null && replays[remove] ? `${modeName(replays[remove].mode)} from ${fmtDateTime(replays[remove].date)}. Export it first to keep a copy.` : null}
      </Dialog>
    </div>
  );
}
