'use client';

import { useEffect, useState } from 'react';
import type { Director } from '@/lib/director';
import { summary } from '@/lib/event';
import { clock, elapsed, shortEvent, signalColour, statusColour, statusText } from '@/lib/format';
import { isMuted, setMuted, armSound } from '@/lib/sound';
import type { AgentState } from '@/lib/state/agentState';
import { officeBus } from '../officeBus';

const LOG_LINES = 9;

interface Props {
  director: Director;
  now: number;
  selected: string | null;
  select: (key: string | null, focus?: boolean) => void;
}

/**
 * The page's screen overlay, ported from the Unity HQ's HqOverlay: a top bar (feed, sessions, working, elapsed, signal,
 * Simulate / Pause / Reset), agent cards on the right, the event log along the bottom, a banner whenever Claude Code is
 * waiting for the owner, and a detail panel for the selected agent.
 */
export function Overlay({ director, now, selected, select }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  useEffect(() => director.onRebuilt(() => setFilter(null)), [director]);
  return (
    <div className="hq-overlay">
      <TopBar director={director} now={now} select={select} />
      <WaitingBanner director={director} select={select} />
      <AgentCards director={director} now={now} selected={selected} select={select} />
      <EventLog director={director} filter={filter} setFilter={setFilter} />
      {selected && <DetailPanel director={director} now={now} agentKey={selected} select={select} />}
      <div className="hq-hint">
        Right-drag / Q E orbit · scroll zoom · middle-drag / WASD pan · F frame all · click someone for details · H hide · F1 debug
      </div>
    </div>
  );
}

function TopBar({ director, now, select }: { director: Director; now: number; select: Props['select'] }) {
  const s = director.state;
  const feed = director.feed(now);
  const feedColour = feed === 'Live' ? '#8EE36A' : feed === 'Simulating' ? '#F09A47' : feed === 'Listening' ? '#8CBFFF' : '#FF594D';
  const start = s.sessionStartMs(now);
  const signal = s.signal(now);
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);
  return (
    <div className="hq-topbar">
      <span className="hq-title">BAYANIHAN HQ</span>
      <span className="hq-feed" title={feed === 'Offline' ? 'The HQ server is not reachable; it reconnects on its own.' : undefined}>
        <span className="hq-dot" style={{ background: feedColour }} />
        {feed}
      </span>
      <span className="hq-stats">
        Sessions <b>{s.activeSessions(now)}</b> &nbsp; Working <b>{s.countStatus('Working')}</b> &nbsp; Waiting{' '}
        <b>{s.countStatus('Waiting')}</b> &nbsp; Session <b>{elapsed(start > 0 ? now - start : 0)}</b>
        {director.paused && <span className="hq-paused"> &nbsp; PAUSED · {director.pending} queued</span>}
      </span>
      <span className="hq-signal-chip" style={{ background: signalColour(signal) }}>
        SIGNAL NO. {signal}
      </span>
      <span className="hq-spacer" />
      <button
        className="hq-btn small"
        title="The ping when someone starts waiting for you"
        onClick={() => {
          armSound();
          setMuted(!muted);
          setMutedState(!muted);
        }}
      >
        {muted ? 'Sound off' : 'Sound on'}
      </button>
      <button className="hq-btn primary" onClick={() => director.setSimulate(!director.simulating)}>
        {director.simulating ? 'Stop Sim' : 'Simulate'}
      </button>
      <button className="hq-btn" onClick={() => director.setPaused(!director.paused)}>
        {director.paused ? 'Resume' : 'Pause'}
      </button>
      <button
        className="hq-btn"
        onClick={() => {
          director.resetOffice();
          select(null);
        }}
      >
        Reset
      </button>
    </div>
  );
}

function WaitingBanner({ director, select }: { director: Director; select: Props['select'] }) {
  const waiting = director.state.waitingAgents();
  if (waiting.length === 0) return null;
  const w = waiting[0];
  const what = w.waitingKind === 'idle_prompt' ? 'Claude is waiting for your next prompt' : w.activity;
  return (
    <button className="hq-banner" onClick={() => select(w.key, true)}>
      ! {w.name} needs you
      <small>{what}</small>
      {waiting.length > 1 && <small>(+{waiting.length - 1} more)</small>}
    </button>
  );
}

function cardLine(a: AgentState, now: number) {
  if (!a.present && !a.isLead) return <span className="hq-faint">not here yet</span>;
  if (a.status === 'Idle' && a.idleFor(now) > 60_000)
    return <span className="hq-soft">on break · idle {Math.floor(a.idleFor(now) / 60_000)} min</span>;
  return <>{a.activity || a.currentTask}</>;
}

function AgentCards({ director, now, selected, select }: Omit<Props, 'director'> & { director: Director }) {
  return (
    <div className="hq-cards">
      {director.state.agents.map(a => (
        <button key={a.key} className={`hq-card${a.key === selected ? ' selected' : ''}`} onClick={() => select(a.key, true)}>
          <span className="stripe" style={{ background: a.entry.color }} />
          <span className="name">{a.name}</span>
          <span className="role">{a.entry.role}</span>
          <span className="chip" style={{ background: statusColour(a.status) }}>
            {a.status === 'Waiting' ? 'WAITING' : a.status.toUpperCase()}
          </span>
          <div className="line">{cardLine(a, now)}</div>
        </button>
      ))}
    </div>
  );
}

function EventLog({ director, filter, setFilter }: { director: Director; filter: string | null; setFilter: (k: string | null) => void }) {
  const s = director.state;
  const lines = [];
  for (let i = s.log.length - 1; i >= 0 && lines.length < LOG_LINES; i--) {
    const e = s.log[i];
    if (filter && e.agent !== filter) continue;
    const who = s.get(e.agent);
    lines.push(
      <div className="hq-log-line" key={`${i}-${e.ts}-${e.ev}`}>
        <span className="t">{clock(e.ts)}</span>
        <span className="who" style={{ color: who ? who.entry.color : '#999' }}>
          {who ? who.name : e.agent}
        </span>
        <span className="ev">{shortEvent(e.ev)}</span>
        {summary(e)}
        {e.ev === 'PostToolUseFailure' && !e.intr && <span className="hq-flag-fail">failed</span>}
        {e.ev === 'PermissionRequest' && <span className="hq-flag-ask">asks permission</span>}
      </div>,
    );
  }
  const chip = (key: string | null, label: string, colour: string) => {
    const on = filter === key;
    return (
      <button key={key ?? '*'} className="hq-chip" style={{ background: hexAlpha(colour, on ? 0.95 : 0.3), color: on ? '#2E1F14' : undefined }} onClick={() => setFilter(key)}>
        {label}
      </button>
    );
  };
  return (
    <div className="hq-log">
      <div className="hq-log-head">
        <span className="hq-log-title">EVENT LOG</span>
        {chip(null, 'All', '#F8D5A6')}
        {s.agents.map(a => chip(a.key, a.name, a.entry.color))}
      </div>
      <div className="hq-log-lines">
        {lines.length ? (
          lines
        ) : (
          <span className="hq-faint">No events yet. Start a Claude Code session in ~/Documents/Bayanihan, or press Simulate.</span>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ director, now, agentKey, select }: { director: Director; now: number; agentKey: string; select: Props['select'] }) {
  const a = director.state.get(agentKey);
  if (!a) return null;
  const files = [...a.filesTouched];
  return (
    <div className="hq-detail">
      <span className="stripe" style={{ background: a.entry.color }} />
      <h2>{a.name}</h2>
      <div className="hq-soft">{a.entry.role}</div>
      <button className="hq-btn small close" onClick={() => select(null)} aria-label="Close">
        X
      </button>
      <div className="row" style={{ marginTop: 10 }}>
        <b style={{ color: statusColour(a.status) }}>{statusText(a.status)}</b>
        {a.status === 'Idle' && a.present && <span className="hq-faint"> &nbsp;for {Math.floor(a.idleFor(now) / 1000)}s</span>}
      </div>
      {a.currentTask && (
        <div className="row">
          <span className="label">Task</span>
          {a.currentTask}
        </div>
      )}
      {a.tool && (
        <div className="row">
          <span className="label">Tool</span>
          {a.tool} {a.file && <span className="hq-soft">&nbsp;{a.file}</span>}
        </div>
      )}
      {a.helper && (
        <div className="row">
          <span className="label">Helper</span>
          {a.helper}
        </div>
      )}
      <div className="row">
        <span className="label">Tool uses</span>
        {a.toolCount} &nbsp; <span className="label">Files touched</span>
        {files.length}
      </div>
      {files.slice(0, 6).map(f => (
        <div className="row ev-line" key={f}>
          &nbsp; {f}
        </div>
      ))}
      {files.length > 6 && <div className="row">&nbsp; …</div>}
      <h3>Last 20 events</h3>
      {[...a.recent].reverse().map((e, i) => (
        <div className="ev-line" key={i}>
          <span className="hq-faint">{clock(e.ts)}</span> <span className="hq-soft">{shortEvent(e.ev)}</span> {summary(e)}
        </div>
      ))}
    </div>
  );
}

/** Pulsing "needs you" badges; the office moves them every frame (over the head, or pinned to the screen edge). */
export function WaitingBadges({ director }: { director: Director }) {
  const waiting = director.state.waitingAgents();
  return (
    <div className="hq-overlay" aria-live="polite">
      {waiting.map(a => (
        <div
          key={a.key}
          className="hq-badge"
          ref={el => {
            if (el) officeBus.badges.set(a.key, el);
            else officeBus.badges.delete(a.key);
          }}
          data-name={a.name}
          style={{ visibility: 'hidden' }}
        >
          ! {a.name} needs you
        </div>
      ))}
    </div>
  );
}

/** The plain view of the state model (F1), for checking what the office is being told. */
export function DebugView({ director, now, close }: { director: Director; now: number; close: () => void }) {
  const s = director.state;
  const start = s.sessionStartMs(now);
  const desks = s.agents
    .map(a => {
      let t = `${a.name}  ${a.entry.role}  ${statusText(a.status).toUpperCase()}`;
      if (a.status === 'Idle' && a.present) t += `  ${Math.floor(a.idleFor(now) / 1000)}s`;
      if (!a.present) t += '  (away)';
      if (a.currentTask) t += `\n   task: ${a.currentTask}`;
      if (a.activity) t += `\n   ${a.activity}${a.helper ? `  [${a.helper}]` : ''}`;
      if (a.toolCount > 0) t += `\n   tools ${a.toolCount} | files ${a.filesTouched.size}`;
      return t;
    })
    .join('\n');
  const board =
    `${s.board.countDone()}/${s.board.items.length} done\n\n` +
    s.board.items
      .map(i => {
        const mark = i.status === 'completed' ? '[x]' : i.status === 'failed' ? '[!]' : i.status === 'in_progress' ? '[>]' : '[ ]';
        return `${mark} ${i.text}  (${s.get(i.owner)?.name ?? i.owner} | ${i.kind})`;
      })
      .join('\n');
  const log = s.log
    .slice(-40)
    .reverse()
    .map(e => `${clock(e.ts)} ${s.get(e.agent)?.name ?? e.agent} ${e.ev} ${summary(e)}`)
    .join('\n');
  return (
    <div className="hq-debug">
      <header>
        <span style={{ color: '#F09A47' }}>BAYANIHAN HQ</span>
        <span>
          {director.feed(now)} | sessions {s.activeSessions(now)} | working {s.countStatus('Working')} | {elapsed(start > 0 ? now - start : 0)} |{' '}
          <span style={{ color: signalColour(s.signal(now)) }}>SIGNAL NO. {s.signal(now)}</span>
          {director.paused && <span className="hq-paused"> | PAUSED ({director.pending} queued)</span>}
        </span>
        <small className="hq-soft">
          (replayed {director.replayed}, received {director.received}, applied {s.eventsApplied})
        </small>
        <span className="hq-spacer" />
        <button className="hq-btn small" onClick={close}>
          Close (F1)
        </button>
      </header>
      <div className="cols">
        <div className="col">{desks}</div>
        <div className="col">{board}</div>
        <div className="col">{log}</div>
      </div>
    </div>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
