import type { AgentStatus } from './state/agentState';

/** The game's own palette (Game/Assets/Scripts/UI/UiTheme.cs), so the HQ looks like part of the Bayanihan family. */
export const Theme = {
  orange: '#F09A47',
  cream: '#F8D5A6',
  creamLight: '#FDEACF',
  ink: '#2E1F14',
  green: '#8EE36A',
  notice: '#FFE06E',
  muted: '#8C7B6B',
  soft: '#B8A48C',
  panel: 'rgba(43, 28, 18, 0.88)',
  panelLight: 'rgba(77, 51, 31, 0.92)',
} as const;

const STATUS_COLOURS: Record<AgentStatus, string> = {
  Thinking: '#8CBFFF',
  Working: Theme.green,
  Waiting: Theme.notice,
  Error: '#FF594D',
  Done: Theme.cream,
  Idle: '#A6998C',
};

export function statusColour(s: AgentStatus): string {
  return STATUS_COLOURS[s];
}

export function statusText(s: AgentStatus): string {
  return s === 'Waiting' ? 'Waiting for you' : s;
}

/** PAGASA signal colours, from calm to severe. */
export function signalColour(signal: number): string {
  switch (signal) {
    case 1:
      return '#8CCCFF';
    case 2:
      return '#8FE36B';
    case 3:
      return '#FFE06E';
    case 4:
      return '#FF995C';
    default:
      return '#FF544D';
  }
}

export const SIGNAL_WORDS = [
  '',
  'Tahimik · all quiet',
  'May ginagawa · work under way',
  'Abala · busy / a failure',
  'Hinihintay ka · waiting for you',
  'Delikado · errors / blocked',
];

/** The log's short name for each hook event. */
export function shortEvent(ev: string): string {
  switch (ev) {
    case 'PreToolUse':
      return 'tool';
    case 'PostToolUse':
      return 'done';
    case 'PostToolUseFailure':
      return 'fail';
    case 'PermissionRequest':
      return 'ask';
    case 'UserPromptSubmit':
      return 'prompt';
    case 'SubagentStart':
      return 'start';
    case 'SubagentStop':
      return 'stop';
    case 'Notification':
      return 'notice';
    case 'SessionStart':
      return 'session';
    case 'SessionEnd':
      return 'end';
    default:
      return ev;
  }
}

/** Local wall-clock time, HH:MM:SS. */
export function clock(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
}

/** H:MM:SS for elapsed time. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
