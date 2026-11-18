// tests/notify-rich.test.mjs — wire-level proof for F3. Spawns the REAL
// notify.mjs against a hermetic local HTTP server standing in for ntfy.sh and
// asserts the exact request BODY: the assistant's transcript text only when the
// user opts in (ntfy.richContent=true), and the generic message otherwise —
// which is the privacy default that keeps conversation text off public topics.
//
// Uses async spawn (not spawnSync) on purpose: the parent event loop must stay
// free to service the child's HTTP request while it runs.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { makeTmpHome } from './fake-home.mjs';
import { runHook } from './hook-runner.mjs';

// A single assistant text line whose sanitized form is byte-identical to the
// source (single spaces, no newlines), so we can assert the exact ntfy body.
const RICH_TEXT = 'All checks passed and the build is green.';

function writeTranscript(home) {
  const p = path.join(home, 'transcript.jsonl');
  fs.writeFileSync(p, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'ship it' } }),
    JSON.stringify({
      type: 'assistant', isSidechain: false,
      message: { role: 'assistant', content: [{ type: 'text', text: RICH_TEXT }] },
    }),
  ].join('\n') + '\n');
  return p;
}

function mkHome(ntfyConfig) {
  // Only ntfy is live; toast and bell are off so the run is deterministic.
  return makeTmpHome('aan-notify-rich-', {
    config: { toast: { enabled: false }, terminalBell: { enabled: false }, ntfy: ntfyConfig },
  });
}

// Async on purpose: this process serves the child's HTTP request.
const runNotify = (home, input) => runHook({ home, payload: input });

describe('notify.mjs rich content on the ntfy wire (F3)', () => {
  let server, base, lastBody;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => { lastBody = body; res.statusCode = 200; res.end('ok'); });
      });
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('ntfy.richContent=true puts the assistant transcript text in the ntfy body', async () => {
    lastBody = null;
    const home = mkHome({ enabled: true, topic: 't', server: base, richContent: true });
    const transcript = writeTranscript(home);
    const res = await runNotify(home, JSON.stringify({
      hook_event_name: 'Stop', cwd: '/work/app', session_id: 'rich1', transcript_path: transcript,
    }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(lastBody, RICH_TEXT);
  });

  it('ntfy.richContent unset keeps the generic body (public-topic privacy default)', async () => {
    lastBody = null;
    const home = mkHome({ enabled: true, topic: 't', server: base });
    const transcript = writeTranscript(home);
    const res = await runNotify(home, JSON.stringify({
      hook_event_name: 'Stop', cwd: '/work/app', session_id: 'rich2', transcript_path: transcript,
    }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(lastBody, 'app: Task complete');
  });
});
