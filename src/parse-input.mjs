// src/parse-input.mjs

const EVENT_MAP = {
  claude: {
    Stop: 'task_complete',
    Notification: 'needs_input',
    SessionStart: 'session_start',
  },
  codex: {
    Stop: 'task_complete',
    PermissionRequest: 'needs_input',
    SessionStart: 'session_start',
  },
  gemini: {
    AfterAgent: 'task_complete',
    Notification: 'needs_input',
    SessionStart: 'session_start',
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

export function parseInput(raw, source, eventOverride) {
  // --event CLI arg takes priority (used by Codex/Cursor which don't send hook_event_name on stdin).
  // Claude and Gemini include hook_event_name in stdin JSON.
  const hookEvent = eventOverride || raw.hook_event_name || raw.hookEventName || '';
  const cwd = raw.cwd || '';
  const map = EVENT_MAP[source] || {};

  return {
    source,
    event: map[hookEvent] || 'unknown',
    cwd,
    projectName: cwd ? (cwd.split(/[\\/]/).filter(Boolean).pop() || '') : '',
    sessionId: raw.session_id || raw.sessionId || '',
    // transcript_path (claude/gemini stdin) locates the session JSONL that F3's
    // rich-content reader tails; captured empty when absent. raw.message is
    // Claude's own Notification text — kept only when it's a string so a
    // structured payload can never smuggle newlines/objects downstream.
    transcriptPath: raw.transcript_path || '',
    message: typeof raw.message === 'string' ? raw.message : '',
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
