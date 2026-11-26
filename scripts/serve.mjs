// Starts the Bayanihan HQ server on http://127.0.0.1:47821, building it first if the sources changed.
//
//   node scripts/serve.mjs              background: what the Claude Code SessionStart hook runs. Starts the server
//                                       detached, logs to server.log, and exits once it answers.
//   node scripts/serve.mjs --foreground `npm start`: runs the server in this terminal (Ctrl+C stops it).
//   node scripts/serve.mjs --stop       `npm stop`: stops a server started by either of the above.
//
// It needs no PATH or npm: it runs Next.js with the same node binary that runs this script. A lock folder keeps two
// sessions starting at once from building or starting twice, and a server already on the port is left alone.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HQ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = 47821;
const NEXT = path.join(HQ, 'node_modules', 'next', 'dist', 'bin', 'next');
const LOG = path.join(HQ, 'server.log');
const PID = path.join(HQ, '.server.pid');
const LOCK = path.join(HQ, '.serve.lock');
const LOCK_STALE_MS = 10 * 60 * 1000;
const BUILD_ID = path.join(HQ, '.next', 'BUILD_ID');
// Anything here newer than the last build means the build is out of date. config/ is read at run time, so it's not here.
const SOURCES = ['src', 'public/fonts', 'scripts/build-map.mjs', 'package.json', 'next.config.ts', 'tsconfig.json'];

const args = new Set(process.argv.slice(2));
const foreground = args.has('--foreground');
const env = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
};

main().catch(err => {
  say(`failed: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
});

async function main() {
  if (args.has('--stop')) return stop();
  if (!fs.existsSync(NEXT)) {
    say('Next.js is not installed here. Run `npm install` in HQ first.');
    process.exitCode = 1;
    return;
  }
  if (await portAnswers()) {
    say(`already running: http://localhost:${PORT}`);
    return;
  }
  if (!takeLock()) {
    say('another start is in progress; leaving it to that one.');
    return;
  }
  try {
    if (!foreground) rotateLog();
    if (needsBuild() && !build()) {
      process.exitCode = 1;
      return;
    }
    if (foreground) {
      releaseLock();
      say(`serving http://localhost:${PORT} (Ctrl+C stops it)`);
      const child = spawn(process.execPath, [NEXT, 'start', '-H', HOST, '-p', String(PORT)], { cwd: HQ, env, stdio: 'inherit' });
      fs.writeFileSync(PID, String(child.pid));
      const forward = sig => child.kill(sig);
      process.on('SIGINT', forward);
      process.on('SIGTERM', forward);
      child.on('exit', code => {
        removePid(child.pid);
        process.exitCode = code ?? 0;
      });
      return;
    }
    const out = fs.openSync(LOG, 'a');
    const child = spawn(process.execPath, [NEXT, 'start', '-H', HOST, '-p', String(PORT)], {
      cwd: HQ,
      env,
      detached: true,
      stdio: ['ignore', out, out],
    });
    fs.writeFileSync(PID, String(child.pid));
    child.unref();
    // Wait (up to 30 s) for it to answer, so the lock covers the whole start.
    for (let i = 0; i < 60 && !(await portAnswers()); i++) await sleep(500);
    say((await portAnswers()) ? `started (pid ${child.pid}): http://localhost:${PORT}` : 'started, but it is not answering yet; see server.log');
  } finally {
    releaseLock();
  }
}

/** True when something accepts connections on the HQ port. */
function portAnswers() {
  return new Promise(resolve => {
    const socket = net.connect({ host: HOST, port: PORT });
    const done = ok => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(400, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function needsBuild() {
  if (!fs.existsSync(path.join(HQ, 'public', 'mabuhay-map.json'))) return true;
  let built;
  try {
    built = fs.statSync(BUILD_ID).mtimeMs;
  } catch {
    return true;
  }
  return SOURCES.some(rel => newestMtime(path.join(HQ, rel)) > built);
}

function newestMtime(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const name of fs.readdirSync(target)) newest = Math.max(newest, newestMtime(path.join(target, name)));
  return newest;
}

function build() {
  say('building (sources changed since the last build)...');
  const opts = { cwd: HQ, env, stdio: foreground ? 'inherit' : ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')] };
  const map = spawnSync(process.execPath, [path.join(HQ, 'scripts', 'build-map.mjs')], opts);
  if (map.status !== 0) say('the map table could not be made; the office still works without it.');
  const next = spawnSync(process.execPath, [NEXT, 'build'], opts);
  if (next.status !== 0) {
    say('the build failed; see server.log.');
    return false;
  }
  return true;
}

function stop() {
  let pid;
  try {
    pid = Number(fs.readFileSync(PID, 'utf8').trim());
  } catch {
    say('no server to stop (no .server.pid).');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    say(`stopped pid ${pid}.`);
  } catch {
    say(`pid ${pid} was not running.`);
  }
  removePid(pid);
}

function takeLock() {
  try {
    fs.mkdirSync(LOCK);
    return true;
  } catch {
    try {
      if (Date.now() - fs.statSync(LOCK).mtimeMs > LOCK_STALE_MS) {
        fs.rmSync(LOCK, { recursive: true, force: true });
        fs.mkdirSync(LOCK);
        return true;
      }
    } catch {
      // someone else just took it
    }
    return false;
  }
}

function releaseLock() {
  try {
    fs.rmSync(LOCK, { recursive: true, force: true });
  } catch {
    // already gone
  }
}

function removePid(pid) {
  try {
    if (Number(fs.readFileSync(PID, 'utf8').trim()) === pid) fs.rmSync(PID);
  } catch {
    // already gone
  }
}

/** Keeps server.log from growing forever: past 1 MB it starts again. */
function rotateLog() {
  try {
    if (fs.statSync(LOG).size > 1024 * 1024) fs.truncateSync(LOG, 0);
  } catch {
    // no log yet
  }
}

function say(message) {
  const line = `[bayanihan-hq ${new Date().toISOString()}] ${message}\n`;
  if (foreground || process.stdout.isTTY) process.stdout.write(line);
  try {
    fs.appendFileSync(LOG, line);
  } catch {
    // the log is a convenience
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
