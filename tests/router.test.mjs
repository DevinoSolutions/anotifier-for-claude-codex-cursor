import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { route, classifyClaudeNotification, isSilentNotification } from '../src/router.mjs';
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
    assert.equal(notif.title, 'my-app · Claude Code');
    assert.equal(notif.message, 'my-app: Task complete');
    assert.equal(notif.toastSound, 'IM');
    assert.equal(notif.priority, 'default');
    assert.equal(notif.ntfyTags, 'white_check_mark');
  });

  it('routes needs_input from codex', () => {
    const event = { source: 'codex', event: 'needs_input', projectName: 'backend' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'backend · Codex');
    assert.equal(notif.message, 'backend: Needs your input');
    assert.equal(notif.toastSound, 'Reminder');
    assert.equal(notif.priority, 'urgent');
  });

  it('routes session_start with low priority and rocket tag', () => {
    const event = { source: 'claude', event: 'session_start', projectName: 'app' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'app · Claude Code');
    assert.equal(notif.message, 'app: Session started');
    assert.equal(notif.priority, 'low');
    assert.equal(notif.ntfyTags, 'rocket');
  });

  it('uses source name as title fallback for unknown sources', () => {
    const event = { source: 'future-tool', event: 'task_complete', projectName: 'app' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'app · future-tool');
  });

  it('handles missing projectName', () => {
    const event = { source: 'claude', event: 'task_complete', projectName: '' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'Claude Code', 'no project → bare label, no dangling separator');
    assert.equal(notif.message, 'Task complete');
  });

  // Regression: the project name used to live ONLY in the body prefix
  // ("my-app: Task complete"). Rich content replaces the whole body with the
  // assistant's words, so a rich toast showed "Claude Code" + a chat snippet and
  // no clue WHICH project it was about. The title is the one field every channel
  // renders and nothing rewrites, so the project name has to live there.
  it('keeps the project name visible when rich content replaces the body', () => {
    const config = {
      ...defaultConfig,
      toast: { enabled: true, richContent: true },
      webhook: { enabled: true, richContent: true },
      ntfy: { enabled: false },
    };
    const event = {
      source: 'claude', event: 'task_complete', projectName: 'my-app',
      transcriptPath: '/nonexistent.jsonl',
    };
    const notif = route(event, config);
    const views = deriveRichViews(event, config, config.events.task_complete, notif,
      () => 'All 42 tests pass, ready to merge.');
    assert.equal(views.toast.message, 'All 42 tests pass, ready to merge.', 'body IS the rich text');
    assert.equal(views.toast.title, 'my-app · Claude Code', 'toast title still names the project');
    assert.equal(views.webhook.title, 'my-app · Claude Code', 'webhook title still names the project');
    assert.equal(views.toast.projectName, 'my-app', 'structured field survives too');
  });

  it('never lets a project name push newlines into the title', () => {
    const event = { source: 'claude', event: 'task_complete', projectName: 'weird\nname' };
    const notif = route(event, defaultConfig);
    assert.equal(notif.title, 'weird name · Claude Code');
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

// Claude Code names each Notification in `notification_type`; only the types
// that wait on you may borrow the urgent needs_input alarm.
describe('route: claude notification_type', () => {
  const typed = (notificationType, extra = {}) => ({
    source: 'claude', event: 'needs_input', projectName: 'app',
    message: 'some Claude text', notificationType, ...extra,
  });

  it('permission_prompt is urgent and says permission', () => {
    const notif = route(typed('permission_prompt'), defaultConfig);
    assert.equal(notif.priority, 'urgent');
    assert.equal(notif.ntfyTags, 'bell,warning');
    assert.equal(notif.toastSound, 'Reminder');
    assert.equal(notif.message, 'app: Needs your permission');
    assert.equal(notif.title, 'app · Claude Code');
  });

  it('a permission prompt stays urgent even if its text reads like the idle nag', () => {
    const notif = route(typed('permission_prompt', { message: 'Claude is waiting for your input' }), defaultConfig);
    assert.equal(notif.priority, 'urgent');
  });

  for (const type of ['elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']) {
    it(`${type} is urgent needs-input`, () => {
      const notif = route(typed(type), defaultConfig);
      assert.equal(notif.priority, 'urgent');
      assert.equal(notif.ntfyTags, 'bell,warning');
      assert.equal(notif.toastSound, 'Reminder');
      assert.equal(notif.message, 'app: Needs your input');
    });
  }

  it('quota_auto_resume_stale is urgent: the task waits for Enter', () => {
    const notif = route(typed('quota_auto_resume_stale'), defaultConfig);
    assert.equal(notif.priority, 'urgent');
    assert.equal(notif.message, 'app: Needs you to resume');
  });

  it('idle_prompt gets the idle-reminder volume by type, whatever its text', () => {
    const notif = route(typed('idle_prompt', { message: 'Claude has been idle (new wording)' }), defaultConfig);
    assert.equal(notif.priority, 'default');
    assert.equal(notif.ntfyTags, 'hourglass_flowing_sand');
    assert.equal(notif.message, 'app: Needs your input');
  });

  it('idle_prompt honors idleReminderPriority', () => {
    const config = {
      ...defaultConfig,
      events: { ...defaultConfig.events, needs_input: { ...defaultConfig.events.needs_input, idleReminderPriority: 'min' } },
    };
    assert.equal(route(typed('idle_prompt'), config).priority, 'min');
    assert.equal(route(typed('permission_prompt'), config).priority, 'urgent');
  });

  for (const [type, text] of [
    ['agent_completed', 'Background agent finished'],
    ['quota_auto_resume_fired', 'Resumed after the usage limit'],
    ['quota_auto_resume_disabled', 'Stopped at the usage limit'],
  ]) {
    it(`${type} is a default-priority notice, never urgent`, () => {
      const notif = route(typed(type), defaultConfig);
      assert.equal(notif.priority, 'default');
      assert.equal(notif.ntfyTags, 'information_source');
      assert.equal(notif.toastSound, 'Default');
      assert.equal(notif.message, `app: ${text}`);
    });
  }

  for (const type of ['auth_success', 'elicitation_response', 'elicitation_complete']) {
    it(`${type} produces no notification`, () => {
      assert.equal(route(typed(type), defaultConfig), null);
      assert.equal(isSilentNotification(typed(type)), true);
    });
  }

  it('an unknown type fails loud: urgent "Needs your attention"', () => {
    for (const type of ['brand_new_type', 'PERMISSION_PROMPT', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const notif = route(typed(type), defaultConfig);
      assert.ok(notif, type);
      assert.equal(notif.priority, 'urgent', type);
      assert.equal(notif.ntfyTags, 'bell,warning', type);
      assert.equal(notif.toastSound, 'Reminder', type);
      assert.equal(notif.message, 'app: Needs your attention', type);
      assert.equal(isSilentNotification(typed(type)), false, type);
    }
  });

  it('an informational notice ignores a user-set urgent needs_input priority', () => {
    const config = {
      ...defaultConfig,
      events: { ...defaultConfig.events, needs_input: { priority: 'urgent', ntfyTags: 'rotating_light', toastSound: 'Alarm' } },
    };
    const notif = route(typed('agent_completed'), config);
    assert.equal(notif.priority, 'default');
    assert.equal(notif.ntfyTags, 'information_source');
    assert.equal(notif.toastSound, 'Default');
  });

  it('a missing type routes exactly as before the field existed', () => {
    for (const notificationType of [undefined, '', null, 42]) {
      const withField = route(typed(notificationType), defaultConfig);
      const { notificationType: _drop, ...legacyEvent } = typed('x');
      const legacy = route(legacyEvent, defaultConfig);
      assert.deepEqual(withField, legacy, String(notificationType));
      assert.equal(withField.priority, 'urgent');
      assert.equal(withField.message, 'app: Needs your input');
    }
    // ...including the wording-based idle-nag fallback.
    const nag = route(typed(undefined, { message: 'Claude is waiting for your input' }), defaultConfig);
    assert.equal(nag.priority, 'default');
    assert.equal(nag.ntfyTags, 'hourglass_flowing_sand');
  });

  it('only applies to claude needs_input', () => {
    // Another source carrying the same field keeps its own routing.
    const gemini = route(typed('auth_success', { source: 'gemini' }), defaultConfig);
    assert.equal(gemini.priority, 'urgent');
    assert.equal(gemini.message, 'app: Needs your input');
    // A different claude event ignores it.
    const stop = route(typed('auth_success', { event: 'task_complete' }), defaultConfig);
    assert.equal(stop.message, 'app: Task complete');
    assert.equal(classifyClaudeNotification(typed('auth_success', { event: 'task_complete' })), null);
    assert.equal(classifyClaudeNotification(null), null);
    assert.equal(classifyClaudeNotification(undefined), null);
  });

  it('keeps Claude\'s own text as the rich body for a notice', () => {
    const config = {
      ...defaultConfig,
      toast: { enabled: true, richContent: true },
      ntfy: { enabled: false },
      webhook: { enabled: false },
    };
    const event = typed('agent_completed', { message: 'Agent "refactor" finished' });
    const notif = route(event, config);
    const views = deriveRichViews(event, config, config.events.needs_input, notif, () => '');
    assert.equal(views.toast.message, 'Agent "refactor" finished');
    assert.equal(views.toast.priority, 'default');
  });
});
