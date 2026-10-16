// src/parse-input.mjs

// `turn_start` is not a notification: it only records when a turn began so the
// matching task_complete can say how long it took (src/turn-timer.mjs).
const EVENT_MAP = {
  claude: {
    Stop: 'task_complete',
    Notification: 'needs_input',
    SessionStart: 'session_start',
    UserPromptSubmit: 'turn_start',
  },
  codex: {
    Stop: 'task_complete',
    PermissionRequest: 'needs_input',
    SessionStart: 'session_start',
    UserPromptSubmit: 'turn_start',
  },
  gemini: {
    AfterAgent: 'task_complete',
    Notification: 'needs_input',
    SessionStart: 'session_start',
    BeforeAgent: 'turn_start',
  },
  // Antigravity CLI's payload names no event, so setup passes --event Stop.
  // It has no notification/permission event (only PreToolUse, PostToolUse,
  // PreInvocation, PostInvocation, Stop), so nothing maps to needs_input.
  // Stop also carries terminationReason, fullyIdle and error, deliberately NOT
  // used: terminationReason values are only partly documented, and fullyIdle
  // false (background work still running) is not known to be followed by a
  // second Stop, so holding the alert back could lose it for good. A missed
  // alert costs more than an early one, so every Stop alerts.
  antigravity: {
    Stop: 'task_complete',
  },
  cursor: {
    stop: 'task_complete',
    sessionEnd: 'task_complete',
    subagentStop: 'task_complete',
  },
};

// Claude Code's Stop payload carries `background_tasks`: the ledger of subagents
// and background shells still running past the main agent's turn ([] when the
// turn really is done, ABSENT on older Claude Code). An entry counts as LIVE
// unless it explicitly says otherwise — only a string status that isn't
// 'running' (e.g. 'completed', 'failed') settles it, so an unrecognized shape
// fails toward "still live". The two errors are not symmetric: a premature
// "Task complete" ping actively misleads, while a suppressed one self-corrects
// when the work drains and Claude re-invokes the agent for a final Stop.
// Absent / non-list => false, which keeps older Claude Code (and every other
// tool, none of which send this) on exactly today's behavior.
function detectLiveBackgroundWork(raw) {
  if (!Array.isArray(raw.background_tasks)) return false;
  return raw.background_tasks.some(
    (task) => task !== null && typeof task === 'object'
      && (typeof task.status !== 'string' || task.status === 'running'),
  );
}

// Only a short, non-empty string counts as a notification type. Anything else
// (missing, null, number, object, blank) reads as "no type", the pre-field
// behavior. The length cap keeps a pathological value short in dedup keys.
function readNotificationType(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 64);
}

// First element of an array when it is a string, else ''. Antigravity and Cursor
// both send the workspace folders as an array; the first is the project.
function firstString(value) {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

// How a Cursor run ended: the `status` of its stop hook (completed, aborted or
// error) or the `reason` of its sessionEnd hook (those three plus window_close
// and user_close, which say nothing about the run). Only 'aborted' and 'error'
// are kept; absent, not a string, or any other value is '' and reads as a normal
// completion, so an older or unfamiliar payload alerts exactly as before.
// Cursor-only: no other agent sends these fields.
function readRunStatus(raw, source, hookEvent) {
  if (source !== 'cursor') return '';
  const value = hookEvent === 'sessionEnd' ? raw.reason : raw.status;
  return value === 'aborted' || value === 'error' ? value : '';
}

export function parseInput(raw, source, eventOverride) {
  // --event CLI arg takes priority (used by Codex/Cursor which don't send hook_event_name on stdin).
  // Claude and Gemini include hook_event_name in stdin JSON.
  const hookEvent = eventOverride || raw.hook_event_name || raw.hookEventName || '';
  // The project folder: cwd, else the first workspace folder (workspacePaths for
  // Antigravity, workspace_roots for Cursor). Each is used only when it is a
  // string, so an odd payload reads as "no project" instead of crashing.
  const workspace = firstString(raw.workspacePaths) || firstString(raw.workspace_roots);
  const cwd = (typeof raw.cwd === 'string' && raw.cwd) || workspace;
  const map = EVENT_MAP[source] || {};

  return {
    source,
    event: map[hookEvent] || 'unknown',
    cwd,
    projectName: cwd ? (cwd.split(/[\\/]/).filter(Boolean).pop() || '') : '',
    // Cursor names it conversation_id (stable across a chat's turns), which makes
    // the dedup lock per conversation instead of global.
    sessionId: raw.session_id || raw.sessionId || raw.conversationId
      || (typeof raw.conversation_id === 'string' ? raw.conversation_id : ''),
    // Codex names the turn on both its prompt and its Stop hook; the turn timer
    // refuses to pair a start and a finish that disagree.
    turnId: typeof raw.turn_id === 'string' ? raw.turn_id : '',
    // transcript_path (claude/gemini stdin) locates the session JSONL that F3's
    // rich-content reader tails; captured empty when absent. raw.message is
    // Claude's own Notification text — kept only when it's a string so a
    // structured payload can never smuggle newlines/objects downstream.
    transcriptPath: raw.transcript_path || '',
    message: typeof raw.message === 'string' ? raw.message : '',
    // Claude Code's Notification payload says WHICH notification fired
    // (permission_prompt, idle_prompt, auth_success, ...); router.mjs decides
    // label and volume from it. Claude-only on purpose: Gemini's Notification
    // carries a field of the same name with its own vocabulary, and must keep
    // today's routing. Empty when absent (older Claude Code) or not a string,
    // which router.mjs treats exactly as before the field existed.
    notificationType: source === 'claude' ? readNotificationType(raw.notification_type) : '',
    // 'aborted' or 'error' when a Cursor run did not finish normally, else ''.
    // notify.mjs sends no alert for an abort (the user did it at the keyboard);
    // router.mjs words an error "Task failed" instead of "Task complete".
    runStatus: readRunStatus(raw, source, hookEvent),
    // True when this Stop fired with work still pending behind it — notify.mjs
    // holds the "Task complete" ping back rather than announcing a turn that
    // isn't over. See detectLiveBackgroundWork above.
    hasLiveBackgroundWork: detectLiveBackgroundWork(raw),
    // Kept even when unmapped: the hook logs unrecognized events by this name
    // so misconfigured wiring (or a tool's new event type) is visible in
    // errors.log instead of vanishing.
    rawEvent: hookEvent,
  };
}
