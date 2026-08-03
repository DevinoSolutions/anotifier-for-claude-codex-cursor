// tests/parse-input.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/parse-input.mjs';

describe('parseInput', () => {
  it('normalizes Claude Code Stop event', () => {
    const raw = { session_id: 's1', cwd: '/home/user/my-project', hook_event_name: 'Stop' };
    const result = parseInput(raw, 'claude');
    assert.equal(result.source, 'claude');
    assert.equal(result.event, 'task_complete');
    assert.equal(result.cwd, '/home/user/my-project');
    assert.equal(result.projectName, 'my-project');
    assert.equal(result.sessionId, 's1');
    assert.equal(result.rawEvent, 'Stop');
    // F3 additive fields default to empty strings when the hook omits them.
    assert.equal(result.transcriptPath, '');
    assert.equal(result.message, '');
  });

  it('normalizes Claude Code Notification event', () => {
    const raw = { session_id: 's2', cwd: '/projects/app', hook_event_name: 'Notification' };
    const result = parseInput(raw, 'claude');
    assert.equal(result.event, 'needs_input');
  });

  it('captures transcript_path for the rich-content reader (F3)', () => {
    const raw = {
      session_id: 's3', cwd: '/projects/app', hook_event_name: 'Stop',
      transcript_path: '/home/user/.claude/projects/app/abc.jsonl',
    };
    const result = parseInput(raw, 'claude');
    assert.equal(result.transcriptPath, '/home/user/.claude/projects/app/abc.jsonl');
  });

  it('captures a Claude Notification message string (F3)', () => {
    const raw = {
      session_id: 's4', cwd: '/projects/app', hook_event_name: 'Notification',
      message: 'Claude needs your permission to run npm install',
    };
    const result = parseInput(raw, 'claude');
    assert.equal(result.event, 'needs_input');
    assert.equal(result.message, 'Claude needs your permission to run npm install');
  });

  it('drops a non-string message so a structured payload cannot leak downstream (F3)', () => {
    const raw = {
      session_id: 's5', cwd: '/projects/app', hook_event_name: 'Notification',
      message: { title: 'nope', body: 'structured' },
    };
    const result = parseInput(raw, 'claude');
    assert.equal(result.message, '');
  });

  it('normalizes Codex Stop event', () => {
    const raw = { session_id: 'c1', cwd: '/work/repo', hook_event_name: 'Stop' };
    const result = parseInput(raw, 'codex');
    assert.equal(result.source, 'codex');
    assert.equal(result.event, 'task_complete');
  });

  it('normalizes Codex PermissionRequest event', () => {
    const raw = { session_id: 'c2', cwd: '/work/repo', hook_event_name: 'PermissionRequest' };
    const result = parseInput(raw, 'codex');
    assert.equal(result.event, 'needs_input');
  });

  it('normalizes Gemini AfterAgent event', () => {
    const raw = { session_id: 'g1', cwd: '/dev/project', hook_event_name: 'AfterAgent' };
    const result = parseInput(raw, 'gemini');
    assert.equal(result.event, 'task_complete');
  });

  it('normalizes Gemini Notification event', () => {
    const raw = { session_id: 'g2', cwd: '/dev/project', hook_event_name: 'Notification' };
    const result = parseInput(raw, 'gemini');
    assert.equal(result.event, 'needs_input');
  });

  it('normalizes Cursor stop event', () => {
    const raw = { session_id: 'cu1', cwd: '/code/app', hook_event_name: 'stop' };
    const result = parseInput(raw, 'cursor');
    assert.equal(result.event, 'task_complete');
  });

  it('normalizes Cursor sessionEnd event', () => {
    const raw = { session_id: 'cu2', cwd: '/code/app', hook_event_name: 'sessionEnd' };
    const result = parseInput(raw, 'cursor');
    assert.equal(result.event, 'task_complete');
  });

  it('uses --event override when stdin has no hook_event_name', () => {
    // Cursor and Codex pass --event as CLI arg since they don't include hook_event_name in stdin
    const raw = { status: 'completed', loop_count: 0 };
    const result = parseInput(raw, 'cursor', 'stop');
    assert.equal(result.event, 'task_complete');
    assert.equal(result.rawEvent, 'stop');
  });

  it('normalizes SessionStart across tools', () => {
    const raw = { session_id: 'x', cwd: '/p', hook_event_name: 'SessionStart' };
    assert.equal(parseInput(raw, 'claude').event, 'session_start');
    assert.equal(parseInput(raw, 'codex').event, 'session_start');
  });

  it('extracts projectName from cwd', () => {
    const raw = { session_id: 'x', cwd: 'C:\\Users\\dev\\my-app', hook_event_name: 'Stop' };
    const result = parseInput(raw, 'claude');
    assert.equal(result.projectName, 'my-app');
  });

  it('handles missing cwd gracefully', () => {
    const raw = { session_id: 'x', hook_event_name: 'Stop' };
    const result = parseInput(raw, 'claude');
    assert.equal(result.cwd, '');
    assert.equal(result.projectName, '');
  });

  it('returns unknown event for unmapped hook names', () => {
    const raw = { session_id: 'x', cwd: '/p', hook_event_name: 'PreToolUse' };
    const result = parseInput(raw, 'claude');
    assert.equal(result.event, 'unknown');
  });
});

describe('parseInput background_tasks ledger (hasLiveBackgroundWork)', () => {
  // Claude Code's Stop payload lists the subagents / background shells still
  // running behind the main agent's turn. notify.mjs holds the "Task complete"
  // ping back while any of them is live; the deciding rule is that only an
  // explicit non-'running' string status settles an entry, so anything
  // unrecognized stays live (a premature ping misleads, a held-back one
  // self-corrects on the final Stop).
  const stopWith = (background_tasks) =>
    parseInput({ session_id: 's', cwd: '/work/app', hook_event_name: 'Stop', background_tasks }, 'claude');

  it('is true for a running subagent entry', () => {
    const result = stopWith([
      { id: 'bg1', type: 'subagent', status: 'running', description: 'audit the config loader', agent_type: 'Explore' },
    ]);
    assert.equal(result.event, 'task_complete');
    assert.equal(result.hasLiveBackgroundWork, true);
  });

  it('is true for a running background shell entry', () => {
    const result = stopWith([{ id: 'bg2', type: 'shell', status: 'running', command: 'npm run build' }]);
    assert.equal(result.hasLiveBackgroundWork, true);
  });

  it('is true when status is missing entirely', () => {
    assert.equal(stopWith([{ id: 'bg3', type: 'subagent' }]).hasLiveBackgroundWork, true);
  });

  it('is true when status is present but not a string', () => {
    // Only an explicit non-'running' STRING settles an entry — a future payload
    // shape must never read as "done" by accident.
    assert.equal(stopWith([{ id: 'bg4', status: { state: 'running' } }]).hasLiveBackgroundWork, true);
    assert.equal(stopWith([{ id: 'bg5', status: null }]).hasLiveBackgroundWork, true);
  });

  it('is false for an empty ledger — the turn really is over', () => {
    assert.equal(stopWith([]).hasLiveBackgroundWork, false);
  });

  it('is false when the field is absent (older Claude Code keeps today behavior)', () => {
    const result = parseInput({ session_id: 's', cwd: '/work/app', hook_event_name: 'Stop' }, 'claude');
    assert.equal(result.hasLiveBackgroundWork, false);
  });

  it('is false when the field is not a list', () => {
    assert.equal(stopWith('running').hasLiveBackgroundWork, false);
    assert.equal(stopWith({ bg1: { status: 'running' } }).hasLiveBackgroundWork, false);
    assert.equal(stopWith(null).hasLiveBackgroundWork, false);
  });

  it('is false when every entry carries an explicit non-running status', () => {
    const result = stopWith([
      { id: 'bg6', type: 'subagent', status: 'completed' },
      { id: 'bg7', type: 'shell', status: 'failed' },
    ]);
    assert.equal(result.hasLiveBackgroundWork, false);
  });

  it('is true when one live entry sits beside non-object junk', () => {
    // Junk entries are not live on their own, but they must not mask a real one.
    const result = stopWith([null, 'bg8', 42, { id: 'bg9', type: 'shell', status: 'running' }]);
    assert.equal(result.hasLiveBackgroundWork, true);
  });

  it('is false for a ledger of nothing but non-object junk', () => {
    assert.equal(stopWith([null, 'bg10', 42]).hasLiveBackgroundWork, false);
  });

  it('is reported for other sources too, but stays false since they never send it', () => {
    // notify.mjs gates on source === 'claude' anyway; this pins that a codex or
    // cursor event can never arrive carrying a surprise true.
    assert.equal(parseInput({ session_id: 'c', hook_event_name: 'Stop' }, 'codex').hasLiveBackgroundWork, false);
    assert.equal(parseInput({ session_id: 'cu' }, 'cursor', 'subagentStop').hasLiveBackgroundWork, false);
  });
});
