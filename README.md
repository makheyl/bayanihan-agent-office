# Bayanihan HQ

Bayanihan HQ is a personal developer tool. It is **not part of the game**.

It is a localhost web page showing a low-poly 3D Barangay Mabuhay DRRM operations centre. In the office you can see, live, what each Claude Code agent is doing while it works on Bayanihan.

It runs outside the Unity project and outside the game's git repo. The folder has its own local git repo, with no remote.

**Stack:** Next.js 16 (App Router), React 19, three.js with React Three Fiber, and Vitest.

## Open it
**Automatic:** start Claude Code in **`~/Documents/Bayanihan`**, then open **http://localhost:47821**.
- The SessionStart hook starts the server in the background when it isn't running.
- The first start after a change builds the app first (about 10 s).
- Hooks are read only from the folder `claude` starts in, so a session started inside `Game/` won't show up.

**By hand:**
- `npm start` runs the server in a terminal; Ctrl+C stops it. If it's already running, it says so.
- `npm stop` stops a server started by the hook or by `npm start`.
- To turn the automatic start off, create an empty file named `.no-autostart` in this folder.

**Demo with no session:** open **http://localhost:47821/?demo**, or press **Simulate** in the top bar. It plays a scripted 2-minute work session that loops:
- the level builder rebuilds the map;
- QA's test fails, a scripter fixes it, and the rerun passes;
- someone waits for your approval;
- idle responders walk to the kubo.

Turning Simulate off brings back the real log. Simulated events are never sent to the server or written to the log.

## What you see
| Status | Responder | Elsewhere |
|---|---|---|
| Working | types; bubble "Edit → SimpleBoat.cs" | monitor bright |
| Thinking | hand to chin, looks at the screen | |
| **Waiting for you** | right hand up, yellow bubble with the command, gold diamond overhead | yellow lamp, ping, badge pinned to the screen edge when they're off-screen, top banner, signal 4–5 |
| Error | slumps; red bubble | red lamp |
| Done | waves with confetti, then idle | whiteboard item ticked |
| Idle ≥ 60 s | walks to the kubo / sari-sari corner | |
| Subagent started | walks in from the door to the desk | Kap. Dado's bubble "Assign → Name" |

- **Whiteboard (*Gawain ngayon*):** each hand-off to a subagent, plus TaskCreate items when Claude uses them.
- **PAGASA signal board:**
  - 1: all quiet
  - 2: work under way
  - 3: busy, or a failure in the last 2 minutes
  - 4: someone waiting for you
  - 5: an error, 3+ failures in 2 minutes, or a wait over 2 minutes
- **Map table:** a plan of Barangay Mabuhay drawn from the game's OpenStreetMap snapshot, `Game/Docs/Maps/mabuhay-carmona.geojson`. The build reads it into `public/mabuhay-map.json`.

**Controls:**
- **Camera:** right-drag or Q/E orbits; the wheel zooms; middle-drag or WASD/arrows pans; F frames the room.
- **Walls:** a wall the camera is orbited behind is hidden.
- **Selecting:** click a responder or their card to focus the camera on them and open their details (task, tool, file, files touched, last 20 events). Esc or X closes the details.
- **Log chips:** filter the event log by agent.
- **Overlay:** H hides it; F1 shows the plain debug view.
- **Top bar:** Simulate, Pause, Reset and Sound.
  - While paused, live events queue up and are applied on resume.
  - The ping needs one click on the page first, because browsers block sound until then.
- **Reduce motion:** with your system's "reduce motion" setting on, confetti, pulsing and camera glides are off.

## How it works
```
Claude Code hooks ─► ../.claude/office/hook.sh ─► hook.mjs ─┬─► ../.claude/office/events.jsonl (always; rotated at 5 MB)
  (async, 14 events)                                       ├─► POST 127.0.0.1:47821/event (when the server is up)
                                                           └─► on SessionStart with no server: node scripts/serve.mjs (detached)
Server (Next.js, 127.0.0.1 only): POST /event ─► hub ─► GET /api/stream (Server-Sent Events) ─► each open page
   Each page first gets "replay": the log tail (last 512 KB, events within 6 h of the newest), read fresh.
Page: Director ─► OfficeState (the rules) ─► 3D office (React Three Fiber) + overlay (React)
```
- **Hooks** live in `~/Documents/Bayanihan/.claude/settings.json`, outside git:
  - SessionStart/End, UserPromptSubmit, Pre/PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubagentStart/Stop, Stop, PreCompact and TaskCreated/Completed.
  - All are `async`, so Claude never waits on them. The script always exits 0, prints nothing, and kills itself after 800 ms.
  - Measured: about 40 ms per event (p95 42 ms), whether the server is up or down.
- **Payload:**
  - Sent: time, session, agent, event, tool, project-relative file path, a redacted preview of at most 100 characters, and success or failure. Also opaque agent and tool-use ids, and task titles for the whiteboard.
  - Never sent: prompts, file contents, tool output or environment variables.
- **Server safety:**
  - It listens on 127.0.0.1 only.
  - `/event` takes only `application/json` bodies up to 64 KB addressed to `localhost` or `127.0.0.1`. That blocks other websites and DNS rebinding.
  - It sends no CORS headers, so no other site can read the stream.
  - Telemetry is off (`NEXT_TELEMETRY_DISABLED=1` in every script).
- **Who did it:**
  - The `agent_type` that hooks report inside subagents decides first.
  - For hand-offs, the Agent tool's `subagent_type` decides.
  - Otherwise the path and command rules in `../.claude/office/routing.json` decide.
- **Subagents:** nine role subagents are in `~/Documents/Bayanihan/.claude/agents/`. Each one's `name` must match a `key` in `config/roster.json`.

## Files
| Path | What |
|---|---|
| `src/lib/` | The office's rules, no visuals: `event.ts` (hook lines), `state/` (statuses, whiteboard, signal), `simulator.ts` (the demo story), `director.ts` (live / Simulate / Pause / Reset). |
| `src/server/`, `src/app/event`, `src/app/api/*` | The receiver, the event stream, log replay, `/api/health`, `/api/roster`. |
| `src/components/office/` | The 3D room: `Room` (walls, kubo, sari-sari, props), `Desk`, `Boards` (whiteboard, signal board, map table), `Responder` + `responderBrain` (figures, poses, walking), `navGrid` (walking paths), `CameraRig`. |
| `src/components/overlay/` | Top bar, waiting banner and badges, agent cards, event log, detail panel, debug view. |
| `scripts/serve.mjs` | Starts the server, building first when the sources changed. Logs to `server.log`. |
| `scripts/build-map.mjs` | Makes `public/mabuhay-map.json` from the game's map snapshot. |
| `config/roster.json` | Each desk's Filipino name, role, colour and desk slot. Read on every page load. |
| `tests/` | Vitest: the 11 tests ported from the Unity HQ, plus Simulate, the server (guard, replay-then-live stream), walking paths and the responder logic. |

## Customise
- **Team:** edit `config/roster.json` and reload the page.
- **Desk rules:** edit `../.claude/office/routing.json`; the hook reads it on every event.
- **Demo story:** `src/lib/simulator.ts`.
- **Room layout:** `src/components/office/layout.ts`.
- After a code change: `npm test`, then restart the server with `npm stop`, then `npm start` (it rebuilds). Use `npm run dev` for hot reload while working on it, after `npm stop`.

## History
The first version was an Editor-only scene inside the Unity project (`Game/Assets/_BayanihanHQ`, PR #10). It moved here so it opens in any browser, and was removed from the game by PR #11. Its C# is in the game's git history at commit `80e7bbd`.

## Assets and placeholders
- Every piece of furniture and every responder is built from primitives in code. There are no models, textures or sound files; the ping is synthesised with WebAudio.
- The fonts are the game's own UI fonts, LilitaOne and MergeOne, copied from `Game/Assets/UI/Fonts`. Both are SIL Open Font License; LilitaOne's licence is in `public/fonts`.
- The map data is © OpenStreetMap contributors (ODbL).
