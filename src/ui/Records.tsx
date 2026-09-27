import { useState } from 'react';
import type { GameDefinition } from '../engine/types';
import { loadRecords, loadReplays, replaysKey } from '../shared/records';
import { replayFileName, type Replay } from '../shared/replay';
import { saveJson } from '../shared/storage';
import { downloadJson } from './download';

export function Records({ game, onWatch }: { game: GameDefinition; onWatch: (r: Replay) => void }) {
  const rec = loadRecords(game.id);
  const [replays, setReplays] = useState<Replay[]>(() => loadReplays(game.id));
  const [msg, setMsg] = useState('');
  const c = rec.career;
  const mins = Math.round(c.secondsDriven / 60);
  const remove = (i: number) => {
    const next = replays.filter((_, k) => k !== i);
    saveJson(replaysKey(game.id), next);
    setReplays(next);
  };
  const importFile = async (f: File) => {
    try {
      const r = JSON.parse(await f.text()) as Replay;
      if (r.v !== 1 || r.game !== game.id || !Array.isArray(r.cmds)) throw new Error('Not a ZDrive replay for this game.');
      onWatch(r);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="records">
      <section>
        <h2>Best scores</h2>
        <table>
          <tbody>
            {game.modes
              .filter((m) => m.id !== 'free')
              .map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  <td className="num">{rec.best[m.id]?.score ?? '—'}</td>
                  <td className="dim">{rec.best[m.id] ? new Date(rec.best[m.id]!.date).toLocaleDateString() : ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Career</h2>
        <div className="stats">
          <div>
            <b>{c.runs}</b>
            <small>runs</small>
          </div>
          <div>
            <b>
              {c.wins}-{c.matches - c.wins - c.ties}-{c.ties}
            </b>
            <small>W-L-T</small>
          </div>
          <div>
            <b>{c.points}</b>
            <small>points</small>
          </div>
          <div>
            <b>{c.placed}</b>
            <small>pieces placed</small>
          </div>
          <div>
            <b>{c.loads}</b>
            <small>match loads</small>
          </div>
          <div>
            <b>{mins}</b>
            <small>minutes driven</small>
          </div>
          <div>
            <b>{c.calls}</b>
            <small>rule calls</small>
          </div>
        </div>
      </section>
      <section className="wide">
        <h2>Replays (last 10)</h2>
        {replays.length === 0 && <p className="hint">Finish a run to save a replay.</p>}
        <ul className="replays">
          {replays.map((r, i) => (
            <li key={r.date + i}>
              <span>
                <b>{game.modes.find((m) => m.id === r.mode)?.label ?? r.mode}</b> · {new Date(r.date).toLocaleString()} · score {r.result.player}
              </span>
              <span className="row">
                <button onClick={() => onWatch(r)}>Watch</button>
                <button onClick={() => downloadJson(replayFileName(r), r)}>Export</button>
                <button onClick={() => remove(i)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
        <label className="file">
          Open a replay file…
          <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        </label>
        {msg && <p className="warn">{msg}</p>}
      </section>
    </div>
  );
}
