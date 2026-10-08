const EVENT_MESSAGES = {
  task_complete: 'Task complete',
  needs_input: 'Needs your input',
  session_start: 'Session started',
};

// Claude Code fires a second Notification ~60s after a turn ends, whose text
// ("Claude is waiting for your input") is an idle nag, not a request: nobody is
// blocked, the work is done. Routed as a plain needs_input it earns the urgent
// priority + alarm tags that exist for a REAL permission prompt, so every task
// the user walks away from ends in the loudest ping the product can send.
//
// When the payload carries notification_type, `idle_prompt` identifies the nag
// (see CLAUDE_NOTIFICATION_TYPES below). Without it (older Claude Code),
// detection is a substring match on Claude's own copy, deliberately: if that
// copy ever changes, the match fails and the nag stays URGENT. The failure
// direction is the whole design — a nag that is too loud is an annoyance, a
// permission prompt that went quiet is a stalled agent, so drift must fail
// toward loud. A real prompt never carries this text and is untouched.
//
// Parity note: magent's state hook filters the identical substring, but acts
// differently — it DROPS the event, because a finished session flipping to
// needs-input is a lie in a persistent status table. A one-shot ping is a
// defensible nudge, so anotifier only turns the volume down.
const IDLE_REMINDER_TEXT = 'waiting for your input';
const IDLE_REMINDER_TAGS = 'hourglass_flowing_sand';

// Claude Code's Notification payload names the notification in
// `notification_type`, and most types are NOT a request for input: auth_success
// fires when a login completes, agent_completed when a background session ends,
// elicitation_response after you answered an MCP form. The hook is registered
// for every type (empty matcher), so without reading the field each of them
// went out as the urgent "Needs your input" alarm. The kinds:
//
//   permission  blocked on an approval: the needs_input priority (urgent by
//               default), "Needs your permission".
//   input       blocked on an answer: the needs_input priority, "Needs your
//               input".
//   idle        the ~60s idle nag: "Needs your input" at the idle-reminder
//               volume (see isIdleReminder), now detected by type, not text.
//   info        something happened, nothing waits on you: sent at normal
//               priority with the info ntfy tag (no bell/warning ntfy tags, no
//               urgent priority). The desktop bell is separate and unchanged.
//               These ignore events.needs_input overrides.
//   skip        no alert at all: the type echoes something you just did at the
//               keyboard (a finished login, an answered elicitation), so a
//               toast or phone push would only be noise.
//
// An unlisted type is treated as `input`, not `info`: every documented
// non-blocking type is listed above, so only a type added after this table
// reaches that path, and we cannot tell whether it blocks. Drift must fail
// loud (see IDLE_REMINDER_TEXT): an extra urgent ping costs less than a
// permission prompt that went quiet and stalled the agent.
//
// A Map, not an object literal: a type of "constructor" or "__proto__" must
// look up as unknown, never as an Object.prototype member.
// Types per https://code.claude.com/docs/en/hooks#notification (2026-10-08).
const CLAUDE_NOTIFICATION_TYPES = new Map([
  ['permission_prompt', { kind: 'permission', text: 'Needs your permission' }],
  ['elicitation_dialog', { kind: 'input', text: 'Needs your input' }],
  ['elicitation_url_dialog', { kind: 'input', text: 'Needs your input' }],
  ['agent_needs_input', { kind: 'input', text: 'Needs your input' }],
  // A usage-limit reset that landed while the machine slept: Claude Code waits
  // for Enter instead of continuing, so the task is stalled on you.
  ['quota_auto_resume_stale', { kind: 'input', text: 'Needs you to resume' }],
  ['idle_prompt', { kind: 'idle', text: 'Needs your input' }],
  ['agent_completed', { kind: 'info', text: 'Background agent finished' }],
  ['quota_auto_resume_fired', { kind: 'info', text: 'Resumed after the usage limit' }],
  ['quota_auto_resume_disabled', { kind: 'info', text: 'Stopped at the usage limit' }],
  ['auth_success', { kind: 'skip', text: '' }],
  ['elicitation_response', { kind: 'skip', text: '' }],
  ['elicitation_complete', { kind: 'skip', text: '' }],
]);
const UNKNOWN_NOTIFICATION = Object.freeze({ kind: 'input', text: 'Needs your attention' });
const INFO_PRIORITY = 'default';
const INFO_TAGS = 'information_source';
const INFO_SOUND = 'Default';

// What a claude needs_input event means, from its notification_type. null when
// the event carries no type (older Claude Code, every other source): that path
// is routed exactly as it was before the field existed.
export function classifyClaudeNotification(event) {
  if (!event || event.source !== 'claude' || event.event !== 'needs_input') return null;
  const type = event.notificationType;
  if (typeof type !== 'string' || type === '') return null;
  return CLAUDE_NOTIFICATION_TYPES.get(type) || UNKNOWN_NOTIFICATION;
}

// True when a claude Notification should produce no alert at all.
export function isSilentNotification(event) {
  return classifyClaudeNotification(event)?.kind === 'skip';
}

function isIdleReminder(event) {
  // The type, when present, is authoritative: idle_prompt is the nag whatever
  // its text says, and a permission prompt is never the nag.
  const typed = classifyClaudeNotification(event);
  if (typed) return typed.kind === 'idle';
  return event.source === 'claude'
    && event.event === 'needs_input'
    && typeof event.message === 'string'
    && event.message.toLowerCase().includes(IDLE_REMINDER_TEXT);
}

// Build the canonical notification object every channel consumes.
// `priority` uses the ntfy 5-level scale (min|low|default|high|urgent) as the
// app-wide scale: ntfy sends it verbatim, the Linux backend maps it to
// notify-send urgency. `toastSound` is only honored by desktop toast backends.
export function route(event, config) {
  const typed = classifyClaudeNotification(event);
  if (typed?.kind === 'skip') return null;
  const messageTemplate = typed ? typed.text : EVENT_MESSAGES[event.event];
  if (!messageTemplate) return null;

  const eventConfig = config.events?.[event.event] || {};
  const sourceConfig = config.sources?.[event.source] || {};
  const label = sourceConfig.label || event.source;
  const prefix = event.projectName ? `${event.projectName}: ` : '';

  // The project name goes in the TITLE, not only the body prefix. Rich content
  // (toast/webhook default ON) replaces the whole body with the assistant's
  // words, and the body prefix went with it — so a rich toast read
  // "Claude Code" + a chat snippet with no clue WHICH project finished. The
  // title is the one field every channel renders and nothing rewrites.
  // The body keeps its "<project>: Task complete" shape byte-identical: CI live
  // lanes and the ntfy privacy default (generic body on public topics) assert
  // on it. Whitespace is collapsed so a pathological directory name can never
  // push a newline into a toast argv.
  const projectLabel = event.projectName
    ? String(event.projectName).replace(/\s+/g, ' ').trim()
    : '';
  const title = projectLabel ? `${projectLabel} · ${label}` : label;

  // Volume only: the idle nag keeps its channels, title and rich body (the nag
  // text is still the ntfy body via transcript.mjs) — it just stops shouting.
  // `events.needs_input.idleReminderPriority` is the escape hatch for users who
  // want the nag louder (or silent-adjacent at 'min'); absent means 'default'.
  const idleReminder = isIdleReminder(event);
  // An informational notice keeps its channels and rich body (Claude's own
  // text) but never borrows the needs_input alarm: no urgent priority, no
  // bell/warning tags, no Reminder sound.
  const info = typed?.kind === 'info';

  let priority = eventConfig.priority || 'default';
  if (idleReminder) priority = eventConfig.idleReminderPriority || 'default';
  else if (info) priority = INFO_PRIORITY;

  let ntfyTags = eventConfig.ntfyTags || '';
  if (idleReminder) ntfyTags = IDLE_REMINDER_TAGS;
  else if (info) ntfyTags = INFO_TAGS;

  return {
    title,
    message: `${prefix}${messageTemplate}`,
    toastSound: info ? INFO_SOUND : (eventConfig.toastSound || 'Default'),
    priority,
    ntfyTags,
    icon: sourceConfig.icon || '',
    clickToFocus: config.toast?.clickToFocus !== false,
    event: event.event,
    source: event.source,
    projectName: event.projectName,
    cwd: event.cwd,
  };
}
