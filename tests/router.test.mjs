import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/router.mjs';
import { deriveRichViews } from '../src/transcript.mjs';

const defaultConfig = {
  events: {
    task_complete: { toastSound: 'IM', priority: 'default', ntfyTags: 'white_check_mark' },
    needs_input: { toastSound: 'Reminder', priority: 'urgent', ntfyTags: 'bell,warning' },
    session_start: { toastSound: 'Default', priority: 'low', ntfyTags: 'rocket' },
  },
  sources: {
    claude: { label: 'Claude Code' },
    codex: { label: 'Codex' },
  },
};

describe('route', () => {
  it('routes task_complete from claude', () => {
    const event = { source: 'claude', event: 'task_complete', projectName: 'my-app' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'Claude Code');
    assert.equal(notif.message, 'my-app: Task complete');
    assert.equal(notif.toastSound, 'IM');
    assert.equal(notif.priority, 'default');
    assert.equal(notif.ntfyTags, 'white_check_mark');
  });

  it('routes needs_input from codex', () => {
    const event = { source: 'codex', event: 'needs_input', projectName: 'backend' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'Codex');
    assert.equal(notif.message, 'backend: Needs your input');
    assert.equal(notif.toastSound, 'Reminder');
    assert.equal(notif.priority, 'urgent');
  });

  it('routes session_start with low priority and rocket tag', () => {
    const event = { source: 'claude', event: 'session_start', projectName: 'app' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'Claude Code');
    assert.equal(notif.message, 'app: Session started');
    assert.equal(notif.priority, 'low');
    assert.equal(notif.ntfyTags, 'rocket');
  });

  it('uses source name as title fallback for unknown sources', () => {
    const event = { source: 'future-tool', event: 'task_complete', projectName: 'app' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'future-tool');
  });

  it('handles missing projectName', () => {
    const event = { source: 'claude', event: 'task_complete', projectName: '' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.message, 'Task complete');
  });

  it('returns null for unknown events', () => {
    const event = { source: 'claude', event: 'unknown', projectName: 'app' };
    const notif = route(event, defaultConfig);
    assert.equal(notif, null);
  });
});

// Claude's ~60s idle nag arrives as a plain Notification and would otherwise
// earn the urgent priority + alarm tags reserved for a real permission prompt.
// The downgrade is volume-only, and every miss must fail toward LOUD.
describe('route: claude idle "waiting for your input" reminder', () => {
  const nag = (message, extra = {}) => ({
    source: 'claude', event: 'needs_input', projectName: 'app', message, ...extra,
  });
  // The real copy Claude Code sends with the idle reminder.
  const IDLE_TEXT = 'Claude is waiting for your input';
  // What a genuine permission prompt looks like — no idle-nag substring.
  const PROMPT_TEXT = 'Claude needs your permission to use Bash';

  it('downgrades the nag to default priority with a calm tag', () => {
    const notif = route(nag(IDLE_TEXT), defaultConfig);
    assert.equal(notif.priority, 'default');
    assert.equal(notif.ntfyTags, 'hourglass_flowing_sand');
  });

  it('matches the nag regardless of case', () => {
    for (const text of [
      IDLE_TEXT.toUpperCase(),
      IDLE_TEXT.toLowerCase(),
      'Claude Is WAITING For Your INPUT',
    ]) {
      assert.equal(route(nag(text), defaultConfig).priority, 'default', text);
    }
  });

  it('leaves a real permission prompt byte-identical to today', () => {
    const notif = route(nag(PROMPT_TEXT), defaultConfig);
    assert.equal(notif.priority, 'urgent');
    assert.equal(notif.ntfyTags, 'bell,warning');
    assert.equal(notif.toastSound, 'Reminder');
    assert.equal(notif.message, 'app: Needs your input');
    // A prompt carrying no message at all (older Claude, other hooks) is the
    // same untouched path.
    const bare = route({ source: 'claude', event: 'needs_input', projectName: 'app' }, defaultConfig);
    assert.deepEqual(bare, route({ source: 'claude', event: 'needs_input', projectName: 'app' }, defaultConfig));
    assert.equal(bare.priority, 'urgent');
    assert.equal(bare.ntfyTags, 'bell,warning');
  });

  it('stays URGENT if Claude changes its copy — drift fails toward loud', () => {
    const notif = route(nag('Claude is idle and would like a response'), defaultConfig);
    assert.equal(notif.priority, 'urgent');
    assert.equal(notif.ntfyTags, 'bell,warning');
  });

  it('never fires for another source that happens to send the same text', () => {
    for (const source of ['codex', 'gemini', 'cursor']) {
      const notif = route(nag(IDLE_TEXT, { source }), defaultConfig);
      assert.equal(notif.priority, 'urgent', source);
      assert.equal(notif.ntfyTags, 'bell,warning', source);
    }
  });

  it('never fires for a different event carrying the same text', () => {
    const notif = route(nag(IDLE_TEXT, { event: 'task_complete' }), defaultConfig);
    assert.equal(notif.priority, 'default');
    assert.equal(notif.ntfyTags, 'white_check_mark', 'task_complete keeps its own tag');
  });

  it('tolerates a non-string message without downgrading', () => {
    for (const message of [undefined, null, 42, { text: IDLE_TEXT }]) {
      assert.equal(route(nag(message), defaultConfig).priority, 'urgent');
    }
  });

  it('honors an explicit events.needs_input.idleReminderPriority', () => {
    const config = {
      ...defaultConfig,
      events: {
        ...defaultConfig.events,
        needs_input: { ...defaultConfig.events.needs_input, idleReminderPriority: 'low' },
      },
    };
    assert.equal(route(nag(IDLE_TEXT), config).priority, 'low');
    // The override is nag-scoped: a real prompt still uses `priority`.
    assert.equal(route(nag(PROMPT_TEXT), config).priority, 'urgent');
  });

  it('keeps the nag text as the rich body — the downgrade changes volume, not content', () => {
    const config = {
      ...defaultConfig,
      toast: { enabled: true, richContent: true },
      ntfy: { enabled: false },
      webhook: { enabled: false },
    };
    const event = nag(IDLE_TEXT);
    const notif = route(event, config);
    const views = deriveRichViews(event, config, config.events.needs_input, notif, () => '');
    assert.equal(views.toast.message, IDLE_TEXT);
    assert.equal(views.toast.priority, 'default', 'rich view carries the downgraded priority');
  });
});
