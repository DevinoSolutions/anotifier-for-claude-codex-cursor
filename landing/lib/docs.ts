/**
 * The full anotifier reference, as structured data.
 *
 * Every fact here mirrors the package README and source at the version in
 * lib/site.ts. The same tree renders to HTML (app/docs) AND to plain markdown
 * (app/llms-full.txt) so humans and language models read one identical text.
 *
 * Inline markup allowed inside strings: `code` and [text](url). Nothing else.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string };

export interface DocSection {
  id: string;
  /** H2 text. Phrased as the question or task a reader (or an LLM) has. */
  title: string;
  /** One-sentence direct answer that opens the section. */
  lead: string;
  blocks: Block[];
  children?: DocSubsection[];
}

interface DocSubsection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface DocFaq {
  q: string;
  a: string;
}

export const DOCS_TITLE = "anotifier documentation";
export const DOCS_DESCRIPTION =
  "Complete anotifier reference: install, setup wizard, every CLI command and config key, agent hook events, notification channels, privacy defaults, troubleshooting.";

export const DOCS: DocSection[] = [
  {
    id: "what-is-anotifier",
    title: "What is anotifier?",
    lead: "anotifier is a free, open-source, zero-dependency Node.js CLI that sends a notification when an AI coding agent finishes a task or needs your input.",
    blocks: [
      {
        kind: "p",
        text: "It hooks into the native event system of Claude Code, OpenAI Codex CLI, Cursor, and Google Gemini CLI, then delivers to the channels you enable: a desktop toast (Windows, macOS, Linux, WSL), a phone push via ntfy (Android and iOS, no account), a webhook (Slack, Discord, Telegram, or any HTTP endpoint), and a terminal bell. All agents share one config file at `~/.anotifier/config.json`.",
      },
      {
        kind: "ul",
        items: [
          "License: AGPL-3.0. Source on [GitHub](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor), package on [npm](https://www.npmjs.com/package/anotifier).",
          "Runtime: Node.js 18 or newer, which every supported agent already requires.",
          "Dependencies: none. Pure Node.js built-ins; `npm i -g anotifier` installs exactly one package.",
          "Privacy: everything runs locally. Only the notification text goes to the channels you configure, and phone push is generic by default.",
        ],
      },
    ],
  },
  {
    id: "install",
    title: "How do I install anotifier?",
    lead: "Run one command; the setup wizard detects your platform and installed agents and wires the hooks.",
    blocks: [
      { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
      {
        kind: "p",
        text: "Restart your AI tools afterwards so they pick up the new hooks. Other install paths:",
      },
      {
        kind: "code",
        lang: "bash",
        code: "# Global install, then run the wizard\nnpm i -g anotifier\nanotifier setup",
      },
      {
        kind: "p",
        text: "As a Claude Code plugin (hooks auto-register; run `/anotifier:setup` inside Claude Code to wire the other agents):",
      },
      {
        kind: "code",
        lang: "text",
        code: "/plugin marketplace add DevinoSolutions/anotifier-for-claude-codex-cursor\n/plugin install anotifier@anotifier",
      },
      { kind: "p", text: "Standalone, without npm:" },
      {
        kind: "code",
        lang: "powershell",
        code: "# Windows (PowerShell)\nirm https://raw.githubusercontent.com/DevinoSolutions/anotifier-for-claude-codex-cursor/main/setup/install.ps1 | iex",
      },
      {
        kind: "code",
        lang: "bash",
        code: "# macOS / Linux\ncurl -fsSL https://raw.githubusercontent.com/DevinoSolutions/anotifier-for-claude-codex-cursor/main/setup/install.sh | bash",
      },
      {
        kind: "table",
        head: ["Platform", "Requirement", "Notes"],
        rows: [
          ["All", "Node.js ≥ 18", "Already present for every supported agent."],
          [
            "Windows",
            "PowerShell 7+ (pwsh)",
            "Toasts use the BurntToast module; setup installs it if missing.",
          ],
          ["macOS", "osascript", "Built in. No extra install."],
          [
            "Linux",
            "notify-send (libnotify)",
            "Optional, for desktop toasts. Headless systems skip toasts silently.",
          ],
          [
            "WSL",
            "WSL2 interop + Windows PowerShell",
            "Both on by default. Toasts are routed to Windows.",
          ],
        ],
      },
    ],
  },
  {
    id: "setup-wizard",
    title: "What does the setup wizard change on my machine?",
    lead: "It writes one shared config, then adds hook entries to each detected agent's own config file, backing up every file it touches first.",
    blocks: [
      {
        kind: "ol",
        items: [
          "Detects the platform and which agents are installed (looks for `~/.claude/settings.json`, `~/.codex`, `~/.cursor`, `~/.gemini`).",
          "Prepares the toast backend: installs BurntToast on Windows, confirms `osascript` on macOS or `notify-send` on Linux.",
          "Asks whether to enable phone push via ntfy and generates a random topic like `anotifier-<16 random chars>`.",
          "Saves `~/.anotifier/config.json`.",
          "Patches each agent's hook config (table below) and copies the original to `~/.anotifier/backups/` first.",
          "Prints the ntfy topic URL to subscribe to in the ntfy app.",
        ],
      },
      {
        kind: "table",
        head: ["Agent", "File patched", "Hook events registered"],
        rows: [
          [
            "Claude Code",
            "`~/.claude/settings.json`",
            "`Stop`, `Notification`",
          ],
          [
            "Codex CLI",
            "`~/.codex/hooks.json` (+ `hooks = true` under `[features]` in `~/.codex/config.toml`)",
            "`Stop`, `PermissionRequest`, `SessionStart`",
          ],
          ["Cursor", "`~/.cursor/hooks.json`", "`stop`"],
          [
            "Gemini CLI",
            "`~/.gemini/settings.json`",
            "`AfterAgent`, `Notification`",
          ],
        ],
      },
      {
        kind: "note",
        text: "Setup fails loudly. If any agent cannot be patched, the wizard exits with code 1 and lists what went wrong instead of reporting success. Ctrl+C before the final write leaves nothing behind.",
      },
      {
        kind: "p",
        text: "Each hook runs `node <path>/src/notify.mjs --source <agent>` with the agent's event JSON on stdin. Hooks time out after 10 seconds and always exit successfully, so a broken channel can never stall the agent.",
      },
    ],
  },
  {
    id: "commands",
    title: "Which CLI commands does anotifier have?",
    lead: "Seven commands: setup, status, test, config, doctor, snooze, and uninstall.",
    blocks: [
      {
        kind: "code",
        lang: "text",
        code: "anotifier setup            # First-time setup wizard\nanotifier status           # Wired tools, config summary, recent hook errors\nanotifier test [channel]   # Fire a test notification (toast | ntfy | webhook | bell | both)\nanotifier config [section] # Interactive settings (ntfy | webhook | sounds | events | sentry)\nanotifier doctor [--deep]  # Diagnose delivery per channel (--deep verifies real delivery)\nanotifier snooze [dur]     # Silence every channel (30m | 2h | 90s | 45 = 45 minutes)\nanotifier snooze off       # Cancel the snooze early\nanotifier uninstall        # Remove anotifier's hooks from every agent\nanotifier --version        # Version, plus an update notice if one is available",
      },
      {
        kind: "table",
        head: ["Command", "What it does", "Exit code"],
        rows: [
          [
            "`setup`",
            "Detects agents, writes config, patches hooks, backs up originals.",
            "1 if no agent was found or any patch failed.",
          ],
          [
            "`status`",
            "Shows version, platform, toast backend, Sentry, snooze, quiet hours, ntfy URL, webhook origin, wired tools with their events, per-event toggles, and the last 8 hook errors from `~/.anotifier/errors.log`.",
            "1 if the config file is invalid.",
          ],
          [
            "`test [channel]`",
            "Sends a real test notification through one channel or all enabled ones.",
            "1 for an unknown channel name.",
          ],
          [
            "`config [section]`",
            "Interactive editor for `ntfy`, `webhook`, `sounds`, `events`, or `sentry`. Writes once at the end; Ctrl+C saves nothing.",
            "1 when not run in a terminal.",
          ],
          [
            "`doctor [--deep] [--json] [--strict]`",
            "Static checks for config, toast backend, bell, ntfy, and webhook. `--deep` fires a marker notification and reads it back from Notification Center (macOS) or dunst history (Linux). `--json` prints machine-readable output. `--strict` turns deep warnings into failures.",
            "1 if any check fails.",
          ],
          [
            "`snooze [dur|off]`",
            "Silences all channels until the deadline stored in `~/.anotifier/.snooze.json`. No argument prints the current state.",
            "1 for an unparseable duration.",
          ],
          [
            "`uninstall`",
            "Removes only the hooks anotifier manages. Your own hooks and the backups stay.",
            "0",
          ],
        ],
      },
    ],
  },
  {
    id: "events",
    title: "Which agent events trigger a notification?",
    lead: "Three normalized events: task_complete, needs_input, and session_start.",
    blocks: [
      {
        kind: "table",
        head: [
          "Event",
          "Meaning",
          "Default toast sound",
          "Default priority",
          "Default ntfy tags",
        ],
        rows: [
          [
            "`task_complete`",
            "The agent finished its turn.",
            "IM",
            "default",
            "white_check_mark",
          ],
          [
            "`needs_input`",
            "The agent asked a question or wants permission to run a tool.",
            "Reminder",
            "urgent",
            "bell,warning",
          ],
          [
            "`session_start`",
            "A new session started. Every channel is off for this event by default.",
            "Default",
            "low",
            "rocket",
          ],
        ],
      },
      {
        kind: "table",
        head: ["Agent", "task_complete comes from", "needs_input comes from"],
        rows: [
          [
            "Claude Code",
            "`Stop` hook",
            "`Notification` hook (permission prompts, questions)",
          ],
          [
            "Codex CLI",
            "`Stop` hook",
            "`PermissionRequest` hook (approval to run a command)",
          ],
          ["Cursor", "`stop` hook", "—"],
          ["Gemini CLI", "`AfterAgent` hook", "`Notification` hook"],
        ],
      },
      {
        kind: "p",
        text: "Every notification is titled `<project> · <agent>` (for example `my-app · Claude Code`), where the project is the name of the working directory the agent runs in. The body is `<project>: Task complete` or `<project>: Needs your input`, unless rich content replaces it (see below).",
      },
      {
        kind: "note",
        text: 'Claude\'s idle reminder is quieter than a real prompt. About a minute after a turn ends, Claude Code sends a second Notification like "Claude is waiting for your input". Nothing is blocked, so anotifier delivers it at default priority with a calm hourglass tag instead of urgent. A genuine permission prompt stays urgent. Set `events.needs_input.idleReminderPriority` to pick your own level; if Claude ever changes that wording the reminder goes back to urgent, never silent.',
      },
      {
        kind: "p",
        text: "Duplicate hook fires within 1.5 seconds for the same agent, event, and session are collapsed by an atomic lock file, so Cursor's double `stop` produces one notification.",
      },
    ],
  },
  {
    id: "channels",
    title: "Which notification channels are supported?",
    lead: "Desktop toast, phone push via ntfy, webhook, and terminal bell. Each is toggled independently and can be disabled per event.",
    blocks: [],
    children: [
      {
        id: "channel-toast",
        title: "Desktop toast",
        blocks: [
          {
            kind: "table",
            head: ["OS", "Backend", "Details"],
            rows: [
              [
                "Windows",
                "BurntToast (PowerShell 7+)",
                "Per-agent icon, per-event sound (`Default`, `IM`, `Mail`, `Reminder`, `SMS`, `Alarm`), click-to-focus via a custom `agentfocus://` URI that brings the terminal or VS Code window that fired the hook to the front.",
              ],
              [
                "macOS",
                "osascript",
                "Built in. Windows sound names are mapped to the closest system sound; unknown names fall back to the default sound.",
              ],
              [
                "Linux",
                "notify-send (libnotify)",
                "Event priority maps to `notify-send` urgency. Sound names are ignored.",
              ],
              [
                "WSL",
                "PowerShell interop",
                "Detected automatically; toasts cross to the Windows host instead of needing a Linux notification daemon.",
              ],
            ],
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "toast": {\n    "enabled": true,\n    "clickToFocus": true,\n    "richContent": true\n  }\n}',
          },
        ],
      },
      {
        id: "channel-ntfy",
        title: "Phone push (ntfy)",
        blocks: [
          {
            kind: "p",
            text: "[ntfy](https://ntfy.sh) is a free, open-source pub/sub push service with Android and iOS apps and no account requirement. anotifier publishes to one topic; every device subscribed to it gets every agent's alerts in one stream.",
          },
          {
            kind: "ol",
            items: [
              "Install the ntfy app: Android (`io.heckel.ntfy` on Google Play) or iOS (App Store).",
              "Run `anotifier setup` and answer yes to phone notifications, or add the block below.",
              "Subscribe in the app to the topic shown during setup, for example `https://ntfy.sh/anotifier-k3j9x2m1p8q4r7s6`.",
              "Run `anotifier test ntfy`. Your phone should buzz within a second.",
            ],
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "ntfy": {\n    "enabled": true,\n    "server": "https://ntfy.sh",\n    "topic": "anotifier-<random>",\n    "click": "",\n    "richContent": false\n  }\n}',
          },
          {
            kind: "ul",
            items: [
              "`server`: any ntfy server, including a self-hosted one.",
              "`click`: URL opened when you tap the notification. Empty means no link.",
              "`richContent`: **off by default for privacy.** Public ntfy.sh topics are guessable, so the body stays generic (`my-app: Task complete`) unless you run a private server and opt in.",
              "Event `priority` (`min`, `low`, `default`, `high`, `urgent`) becomes the ntfy push priority; `ntfyTags` become the emoji tags.",
              "Non-ASCII titles (the `·` separator, non-Latin project names) are RFC 2047-encoded in the HTTP header and decoded by ntfy, so they display correctly.",
            ],
          },
        ],
      },
      {
        id: "channel-webhook",
        title: "Webhook (Slack, Discord, Telegram, generic)",
        blocks: [
          {
            kind: "p",
            text: "Set `webhook.enabled` to true and a `webhook.url`. `format` picks the payload shape. `authorization`, if set, is sent as the `Authorization` header for every format.",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "webhook": {\n    "enabled": true,\n    "url": "https://hooks.slack.com/services/...",\n    "format": "slack",\n    "richContent": true\n  }\n}',
          },
          {
            kind: "table",
            head: ["format", "URL to use", "Payload"],
            rows: [
              ["`slack`", "Slack Incoming Webhook URL", "Slack message JSON."],
              [
                "`discord`",
                "Discord channel webhook URL",
                "Discord webhook JSON.",
              ],
              [
                "`telegram`",
                "`https://api.telegram.org/bot<token>/sendMessage` plus `chatId`",
                "`{ chat_id, text }` with the title and message on two lines.",
              ],
              [
                "`generic`",
                "Any HTTPS endpoint",
                "`{ title, message, source, project, event, timestamp }` as JSON.",
              ],
            ],
          },
          {
            kind: "note",
            text: "Webhook URLs are secrets (Slack and Discord embed tokens in the URL; Telegram embeds the bot token). anotifier never logs the full URL. Failures record only the URL's origin, in `~/.anotifier/errors.log`, and `anotifier status` shows the origin only.",
          },
        ],
      },
      {
        id: "channel-bell",
        title: "Terminal bell",
        blocks: [
          {
            kind: "p",
            text: "An audible ding in the terminal that launched the agent. For Claude Code 2.1.141 and newer it rings through Claude Code's own terminal write path (the `terminalSequence` field in the hook reply), which is safe in tmux, GNU screen, and on Windows. Other agents get a direct BEL byte to the controlling terminal. `anotifier doctor` warns when your terminal is known to swallow the bell.",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "terminalBell": { "enabled": true } }',
          },
        ],
      },
    ],
  },
  {
    id: "rich-content",
    title: "What does the notification actually say?",
    lead: "For Claude Code, toasts and webhooks show what the agent said or asked, read from the session transcript; other agents and phone push get the generic text.",
    blocks: [
      {
        kind: "p",
        text: "A `needs_input` notification carries Claude's own question; a `task_complete` notification carries the last assistant message. Both are collapsed to one line and trimmed to about 180 characters. Session-start notifications stay generic. Codex, Cursor, and Gemini CLI do not expose a transcript, so they always get `<project>: Task complete` style text. The project name stays in the title on every channel, so a rich body never hides which repo finished.",
      },
      {
        kind: "table",
        head: ["Channel", "Config key", "Default", "Why"],
        rows: [
          ["Toast", "`toast.richContent`", "`true`", "Your own screen."],
          ["Webhook", "`webhook.richContent`", "`true`", "Your own endpoint."],
          [
            "ntfy",
            "`ntfy.richContent`",
            "`false`",
            "Public ntfy.sh topics are guessable; conversation text must not leak there.",
          ],
        ],
      },
    ],
  },
  {
    id: "config",
    title: "What are all the config options?",
    lead: "One JSON file, `~/.anotifier/config.json`, shared by every agent. Missing keys fall back to these defaults.",
    blocks: [
      {
        kind: "code",
        lang: "json",
        code: '{\n  "ntfy": { "enabled": true, "server": "https://ntfy.sh", "topic": "", "click": "", "richContent": false },\n  "toast": { "enabled": true, "clickToFocus": true, "richContent": true },\n  "terminalBell": { "enabled": true },\n  "webhook": { "enabled": false, "url": "", "format": "generic", "richContent": true },\n  "sentry": { "enabled": false, "dsn": "" },\n  "updateCheck": { "enabled": true },\n  "quietHours": { "enabled": false, "from": "22:00", "to": "08:00" },\n  "events": {\n    "task_complete": { "toastSound": "IM", "priority": "default", "ntfyTags": "white_check_mark" },\n    "needs_input": { "toastSound": "Reminder", "priority": "urgent", "ntfyTags": "bell,warning" },\n    "session_start": {\n      "toastSound": "Default", "priority": "low", "ntfyTags": "rocket",\n      "toastEnabled": false, "ntfyEnabled": false, "terminalBellEnabled": false\n    }\n  },\n  "sources": {\n    "claude": { "label": "Claude Code", "icon": "https://…/claude-app-icon.png" },\n    "codex": { "label": "Codex", "icon": "https://openai.com/favicon.ico" },\n    "gemini": { "label": "Gemini", "icon": "https://…/gemini_sparkle.svg" },\n    "cursor": { "label": "Cursor", "icon": "https://cursor.com/apple-touch-icon.png" }\n  }\n}',
      },
      {
        kind: "table",
        head: ["Key", "Type", "Default", "Description"],
        rows: [
          [
            "`ntfy.enabled`",
            "boolean",
            "`true`",
            "Send phone push notifications.",
          ],
          [
            "`ntfy.server`",
            "URL",
            "`https://ntfy.sh`",
            "ntfy server, public or self-hosted.",
          ],
          [
            "`ntfy.topic`",
            "string",
            '`""`',
            "Topic to publish to. Set by the wizard.",
          ],
          [
            "`ntfy.click`",
            "URL",
            '`""`',
            "Opened when you tap the push. Empty = none.",
          ],
          [
            "`ntfy.richContent`",
            "boolean",
            "`false`",
            "Put the agent's words in the push body. Keep off on public servers.",
          ],
          ["`toast.enabled`", "boolean", "`true`", "Desktop toasts."],
          [
            "`toast.clickToFocus`",
            "boolean",
            "`true`",
            "Clicking the toast focuses the originating window (Windows).",
          ],
          [
            "`toast.richContent`",
            "boolean",
            "`true`",
            "Claude Code toasts show the transcript snippet.",
          ],
          [
            "`terminalBell.enabled`",
            "boolean",
            "`true`",
            "Ring the launching terminal.",
          ],
          ["`webhook.enabled`", "boolean", "`false`", "POST to a webhook."],
          ["`webhook.url`", "URL", '`""`', "Destination. Treated as a secret."],
          [
            "`webhook.format`",
            "enum",
            "`generic`",
            "`generic`, `slack`, `discord`, or `telegram`.",
          ],
          [
            "`webhook.chatId`",
            "string",
            "—",
            "Telegram chat id (telegram format only).",
          ],
          [
            "`webhook.authorization`",
            "string",
            "—",
            "Sent verbatim as the `Authorization` header.",
          ],
          [
            "`webhook.richContent`",
            "boolean",
            "`true`",
            "Claude Code webhooks carry the transcript snippet.",
          ],
          [
            "`sentry.enabled`",
            "boolean",
            "`false`",
            "Mirror hook errors to your own Sentry project. Opt-in, zero-dependency envelope client, error data only.",
          ],
          ["`sentry.dsn`", "string", '`""`', "Your Sentry DSN."],
          [
            "`updateCheck.enabled`",
            "boolean",
            "`true`",
            "Ask the npm registry at most once a day and announce a new version at most once per version through your existing channels (never the bell). `false` disables the check and its state file entirely.",
          ],
          [
            "`quietHours.enabled`",
            "boolean",
            "`false`",
            "Silence all channels inside a daily window.",
          ],
          [
            "`quietHours.from` / `to`",
            "`HH:MM`",
            "`22:00` / `08:00`",
            "Local time, 24-hour. Start inclusive, end exclusive, may span midnight.",
          ],
          [
            "`events.<event>.toastSound`",
            "string",
            "per event",
            "Windows BurntToast sound name; mapped on macOS, ignored on Linux.",
          ],
          [
            "`events.<event>.priority`",
            "enum",
            "per event",
            "`min`, `low`, `default`, `high`, `urgent`. Drives ntfy priority and Linux urgency.",
          ],
          [
            "`events.<event>.ntfyTags`",
            "string",
            "per event",
            "Comma-separated ntfy emoji tags.",
          ],
          [
            "`events.<event>.toastEnabled`",
            "boolean",
            "`true`",
            "Per-event toast switch.",
          ],
          [
            "`events.<event>.ntfyEnabled`",
            "boolean",
            "`true`",
            "Per-event push switch.",
          ],
          [
            "`events.<event>.webhookEnabled`",
            "boolean",
            "`true`",
            "Per-event webhook switch.",
          ],
          [
            "`events.<event>.terminalBellEnabled`",
            "boolean",
            "`true`",
            "Per-event bell switch.",
          ],
          [
            "`events.needs_input.idleReminderPriority`",
            "enum",
            "`default`",
            'Priority for Claude\'s "waiting for your input" idle reminder only.',
          ],
          [
            "`sources.<agent>.label`",
            "string",
            "per agent",
            "Name shown in the title.",
          ],
          [
            "`sources.<agent>.icon`",
            "URL",
            "per agent",
            "Icon URL used by toasts and ntfy.",
          ],
        ],
      },
      {
        kind: "note",
        text: "A corrupt config never silences you by accident. An invalid JSON file makes `status` and `config` exit 1 with the parse problem, `setup` offers to rebuild it, and a malformed quiet-hours time disables just that block and is reported by `status`.",
      },
    ],
  },
  {
    id: "quiet-hours-snooze",
    title: "How do I pause notifications?",
    lead: "Use snooze for a one-off pause and quiet hours for a recurring nightly window. Either one alone silences every channel.",
    blocks: [
      {
        kind: "code",
        lang: "bash",
        code: 'anotifier snooze 30m     # also 2h, 90s, or a bare number of minutes (45)\nanotifier snooze         # prints "Snoozed until 14:32" or "Not snoozed"\nanotifier snooze off     # cancel early',
      },
      {
        kind: "code",
        lang: "json",
        code: '{ "quietHours": { "enabled": true, "from": "22:00", "to": "08:00" } }',
      },
      {
        kind: "ul",
        items: [
          "Snooze survives reboots: the deadline lives in `~/.anotifier/.snooze.json` and expires on its own.",
          "Quiet hours use your machine's local time. `22:00` to `08:00` covers 22:00–23:59 and 00:00–07:59. `from` equal to `to` turns the feature off rather than silencing a full day.",
          "A silenced run sends nothing on any channel, including the update notice, but the hook still exits 0 and still returns the reply its agent expects, so silencing can never stall Claude Code, Codex, Cursor, or Gemini CLI.",
          "`anotifier status` shows both the snooze deadline and whether you are inside the quiet window right now.",
        ],
      },
    ],
  },
  {
    id: "errors",
    title: "What happens when a notification fails?",
    lead: "The agent is never interrupted. The error is appended to ~/.anotifier/errors.log and shown by anotifier status.",
    blocks: [
      {
        kind: "ul",
        items: [
          "Hook processes always exit 0 and always return the JSON the agent expects, even after an internal error.",
          "`anotifier status` lists the last 8 hook errors with timestamp and context, and points at the log file.",
          "`anotifier doctor` runs static checks per channel; `doctor --deep` sends a real marker notification and reads it back from Notification Center (macOS) or dunst history (Linux). Windows gets a static PowerShell + BurntToast + execution-policy check.",
          "Opt-in Sentry mirroring (`sentry.enabled` + `sentry.dsn`) sends error events only, through a built-in zero-dependency client. No SDK is bundled and no telemetry is collected.",
        ],
      },
    ],
  },
  {
    id: "uninstall",
    title: "How do I uninstall anotifier?",
    lead: "Run anotifier uninstall. It removes only the hooks anotifier manages and leaves your own hooks and its backups in place.",
    blocks: [
      {
        kind: "code",
        lang: "bash",
        code: "anotifier uninstall\n# then, if you installed globally\nnpm uninstall -g anotifier",
      },
      {
        kind: "p",
        text: "Codex trust hashes that anotifier added under `[hooks.state]` in `~/.codex/config.toml` are removed too. Original configs remain at `~/.anotifier/backups/` for you to keep or delete, along with `~/.anotifier/config.json`.",
      },
    ],
  },
  {
    id: "testing",
    title: "How is anotifier tested?",
    lead: "Against the real agents and real operating systems, with the delivered notification read back out of each OS's own notification store.",
    blocks: [
      {
        kind: "ul",
        items: [
          "Unit and integration suites run on Linux, macOS, and Windows for every change.",
          "End-to-end lanes install the real Claude, Codex, Gemini, and Cursor CLIs from npm, drive them, and assert a real ntfy.sh push round-trips.",
          "Toast lanes fire the real backend, then read the record back from dunst history plus an OCR of the on-screen banner (Linux), Notification Center's SQLite database (macOS), and `wpndatabase.db` (Windows). A silently dropped toast turns CI red.",
          "A tmux lane drives the real Codex TUI through an approval modal and proves the `PermissionRequest` alert fires.",
          "Every lane is required and hard-fails; live status badges are on the [GitHub README](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor#testing).",
        ],
      },
    ],
  },
];

export const DOCS_FAQ: DocFaq[] = [
  {
    q: "Does anotifier send my code or conversation anywhere?",
    a: "No. It runs locally with zero dependencies. Only the notification text goes to channels you configured yourself, and phone push is generic by default because public ntfy topics are guessable.",
  },
  {
    q: "Which AI coding agents does anotifier support?",
    a: "Claude Code (terminal and VS Code extension), OpenAI Codex CLI, Cursor's agent, and Google Gemini CLI. All four are wired by one setup command and share one config.",
  },
  {
    q: "Does it work inside VS Code?",
    a: "Yes. The hooks fire whether the agent runs in a standalone terminal, the VS Code integrated terminal, or the Claude Code extension, and no VS Code extension is required. On Windows, clicking the toast focuses the exact window that fired it.",
  },
  {
    q: "Can a broken notification break my agent?",
    a: "No. Hooks always exit successfully and return the reply the agent expects. Failures go to ~/.anotifier/errors.log and appear in anotifier status.",
  },
  {
    q: "Do I need an account for phone notifications?",
    a: "No. ntfy is free and account-free. Install the app, subscribe to the topic setup prints, done. You can point anotifier at a self-hosted ntfy server too.",
  },
  {
    q: "Can I approve Codex or Claude permission prompts from my phone?",
    a: "Not yet. anotifier alerts you the instant an approval is requested and, on Windows, click-to-focus brings you back to the right window, but the decision is made at the keyboard. Remote Allow/Deny is on the roadmap pending a security design.",
  },
  {
    q: "How do I stop getting a notification for one event?",
    a: "Set the per-event switch, for example events.session_start.toastEnabled: false, or events.task_complete.webhookEnabled: false. Use snooze or quiet hours to silence everything for a while.",
  },
  {
    q: "Is anotifier free?",
    a: "Yes. It is open source under AGPL-3.0 with no paid tier, no account, and no telemetry. Sponsorship is welcome but never required.",
  },
];
