/**
 * Alternatives to anotifier, described from each project's own public README
 * or website as read on 2026-09-10. Only stated facts, no guesses; where a
 * project does not mention a capability the table says "not listed".
 */

export interface Alternative {
  name: string;
  url: string;
  /** e.g. "open source CLI", "paid SaaS", "macOS app" */
  kind: string;
  facts: string[];
  verdict: string;
  /** Row for the comparison table, in COMPARE_COLUMNS order. */
  row: string[];
}

export const COMPARE_INTRO =
  "There are three families of tools for getting alerted when an AI coding agent finishes: a hook you write yourself, an open-source notifier that wires the hooks for you, and a paid service or app. Below is what each project says about itself, checked against its own README or site on 2026-09-10, so you can pick the one that fits. anotifier is the open-source, cross-platform, multi-agent option with phone push and webhooks; two projects go further than it on remote approval.";

export const COMPARE_COLUMNS = [
  "Tool",
  "Agents",
  "Desktop",
  "Phone push",
  "Slack / Discord / Telegram",
  "OS",
  "Approve from phone",
  "Price",
];

export const ALTERNATIVES: Alternative[] = [
  {
    name: "anotifier",
    url: "https://anotifier.io/",
    kind: "open source CLI (AGPL-3.0)",
    facts: [
      "Agents: Claude Code, Codex CLI, Cursor, Gemini CLI, plus any of them inside VS Code.",
      "Channels: desktop toast (Windows via BurntToast, macOS, Linux, WSL routed to Windows), phone push via ntfy, webhooks with Slack, Discord, Telegram, and generic formats, terminal bell.",
      "Claude Code toasts and webhooks carry the agent's actual words; every title names the project.",
      "Zero npm dependencies, one shared config, per-event priority, snooze and quiet hours, click-to-focus on Windows.",
      "CI drives the real agent CLIs and reads delivered notifications back from each OS's notification store.",
    ],
    verdict:
      "Best when you run more than one agent, want phone plus chat delivery, and want it free and cross-platform. No remote approval yet.",
    row: [
      "anotifier",
      "Claude Code · Codex · Cursor · Gemini CLI",
      "Win · macOS · Linux · WSL",
      "ntfy",
      "All three + generic",
      "Windows, macOS, Linux",
      "No (roadmap)",
      "Free",
    ],
  },
  {
    name: "Do-it-yourself hooks",
    url: "/guides/claude-code-notifications/",
    kind: "no install",
    facts: [
      "Every supported agent can run a shell command on completion; add `osascript`, `notify-send`, or a `curl` to ntfy in its hook config.",
      "Fixed text per hook unless you script transcript parsing yourself; repeat the work per agent and per OS.",
      "No de-duplication, priorities, or snooze unless you build them.",
    ],
    verdict:
      "Best for one agent, one machine, and a fixed message. Our per-agent guides include copy-paste configs.",
    row: [
      "DIY hooks",
      "Any agent with hooks",
      "Whatever you script",
      "curl to ntfy",
      "Write the JSON",
      "Per script",
      "No",
      "Free",
    ],
  },
  {
    name: "code-notify",
    url: "https://github.com/mylee04/code-notify",
    kind: "open source CLI (MIT)",
    facts: [
      "README lists Claude Code, OpenAI Codex, Google Gemini CLI, and Oh My Pi.",
      "Desktop notifications with sound files, voice announcements on macOS and Windows, Slack and Discord webhooks, and usage-quota alerts with reset reminders.",
      "Installs via Homebrew, npm, or shell scripts on macOS, Linux, and Windows.",
      "Per-project settings; macOS click-through control to choose which app is activated.",
    ],
    verdict:
      "Closest open-source peer. Strong on sound and voice and quota alerts; phone push is not listed, and Cursor is not listed.",
    row: [
      "code-notify",
      "Claude Code · Codex · Gemini CLI · Oh My Pi",
      "Win · macOS · Linux",
      "Not listed",
      "Slack · Discord",
      "Windows, macOS, Linux",
      "No",
      "Free",
    ],
  },
  {
    name: "agent-notify",
    url: "https://github.com/cfngc4594/agent-notify",
    kind: "open source binary (MIT)",
    facts: [
      "README lists Claude Code, Cursor, and OpenAI Codex.",
      "macOS Notification Center, system sounds, voice announcements via `say`, and ntfy push (ntfy.sh or self-hosted).",
      "macOS only, Apple Silicon and Intel; installed by a curl script or built from source with Bun.",
      "Installer previews a diff and keeps timestamped backups of the configs it edits.",
    ],
    verdict:
      "Good pick for Mac-only users who want voice announcements. No Windows or Linux, no chat webhooks listed.",
    row: [
      "agent-notify",
      "Claude Code · Cursor · Codex",
      "macOS",
      "ntfy",
      "Not listed",
      "macOS",
      "No",
      "Free",
    ],
  },
  {
    name: "claude-ntfy-hook",
    url: "https://github.com/nickknissen/claude-ntfy-hook",
    kind: "open source script (MIT)",
    facts: [
      "Claude Code only, through its native hooks.",
      "ntfy push with interactive Allow/Deny buttons for tool calls and plan approval from the phone.",
      "Requires Tailscale on both the machine and the phone, the `uv` runner, and a local server the hook auto-starts.",
      "Reads your Claude Code ask/allow/deny rules to filter what it sends; retries with backoff.",
    ],
    verdict:
      "The open-source way to approve Claude tool calls from your phone, if you already run Tailscale. Single agent, phone only.",
    row: [
      "claude-ntfy-hook",
      "Claude Code",
      "Not listed",
      "ntfy",
      "Not listed",
      "Windows, macOS, Linux",
      "Yes (Tailscale)",
      "Free",
    ],
  },
  {
    name: "Pushary",
    url: "https://pushary.com/claude-code-notifications",
    kind: "paid SaaS",
    facts: [
      "Site lists Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI, and Windsurf; works with any Claude client that supports MCP servers.",
      "Two-way: approve permissions and answer yes/no questions from the notification; per-tool permission policies and an audit trail.",
      "Web push to iPhone, Android, and desktop; no native app. Setup via `npx @pushary/agent-hooks@latest setup`.",
      "3-day free trial, then $9.99/month for 5,000 notifications and MCP API access.",
    ],
    verdict:
      "Pick it if answering the agent from your lock screen is worth a subscription and routing through a hosted service.",
    row: [
      "Pushary",
      "Claude Code · Claude Desktop · Cursor · Codex · Gemini CLI · Windsurf",
      "Web push",
      "Web push",
      "Not listed",
      "Any (browser)",
      "Yes",
      "$9.99/mo after trial",
    ],
  },
  {
    name: "AI Done Now",
    url: "https://www.aidonenow.com/claude-code-notifications",
    kind: "paid macOS app",
    facts: [
      "Native macOS menu-bar app; supports Claude Code, Cursor, Codex, and Gemini CLI.",
      "Sound plus banner, visible even with volume muted; click-to-focus back to the tool; zero configuration, click Start per tool.",
      "Watches Claude Code's Stop and Notification events. Only the license key leaves the Mac.",
      "One-time purchase with future updates included.",
    ],
    verdict:
      "Nice for Mac users who want a GUI and no config files. macOS only, desktop only.",
    row: [
      "AI Done Now",
      "Claude Code · Cursor · Codex · Gemini CLI",
      "macOS",
      "Not listed",
      "Not listed",
      "macOS",
      "No",
      "One-time purchase",
    ],
  },
];
