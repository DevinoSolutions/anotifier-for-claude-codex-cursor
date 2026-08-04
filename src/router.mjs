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
// Detection is a substring match on Claude's own copy, deliberately: if that
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

function isIdleReminder(event) {
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
  const messageTemplate = EVENT_MESSAGES[event.event];
  if (!messageTemplate) return null;

  const eventConfig = config.events?.[event.event] || {};
  const sourceConfig = config.sources?.[event.source] || {};
  const label = sourceConfig.label || event.source;
  const prefix = event.projectName ? `${event.projectName}: ` : '';

  // Volume only: the idle nag keeps its channels, title and rich body (the nag
  // text is still the ntfy body via transcript.mjs) — it just stops shouting.
  // `events.needs_input.idleReminderPriority` is the escape hatch for users who
  // want the nag louder (or silent-adjacent at 'min'); absent means 'default'.
  const idleReminder = isIdleReminder(event);

  return {
    title: label,
    message: `${prefix}${messageTemplate}`,
    toastSound: eventConfig.toastSound || 'Default',
    priority: idleReminder
      ? (eventConfig.idleReminderPriority || 'default')
      : (eventConfig.priority || 'default'),
    ntfyTags: idleReminder ? IDLE_REMINDER_TAGS : (eventConfig.ntfyTags || ''),
    icon: sourceConfig.icon || '',
    clickToFocus: config.toast?.clickToFocus !== false,
    event: event.event,
    source: event.source,
    projectName: event.projectName,
    cwd: event.cwd,
  };
}
