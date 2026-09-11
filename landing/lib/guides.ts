import type { Block, DocFaq } from "./docs";

/**
 * Long-form "how do I get notified when X finishes" guides — one per agent.
 * These answer the question people actually type into Google, cover EVERY
 * option honestly (built-in, DIY hook, DIY phone push, anotifier), and only
 * then explain what anotifier adds. Facts about each agent's own features are
 * kept to what their public docs state; anotifier facts mirror lib/docs.ts.
 */

interface GuideSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Guide {
  slug: string;
  /** Agent slug on this site, for cross-links (/claude-code/ etc.). */
  agentSlug: string;
  agentName: string;
  icon: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: GuideSection[];
  faqs: DocFaq[];
}

const WHAT_ANOTIFIER_ADDS: Block[] = [
  {
    kind: "table",
    head: ["", "Built-in", "DIY hook", "anotifier"],
    rows: [
      [
        "Desktop toast",
        "Terminal-dependent",
        "Yes, fixed text",
        "Yes, Windows · macOS · Linux · WSL",
      ],
      [
        "Phone push",
        "No",
        "With a curl to ntfy",
        "Yes, ntfy, generic by default",
      ],
      [
        "Slack / Discord / Telegram",
        "No",
        "Write the JSON yourself",
        "Yes, pick a `format`",
      ],
      [
        "Shows what the agent said",
        "No",
        "No",
        "Yes for Claude Code (toast + webhook)",
      ],
      [
        "Names the project",
        "No",
        "Hard-code it",
        "Yes, `my-app · Claude Code` in every title",
      ],
      [
        "Urgent for approvals, calm for done",
        "No",
        "Two hooks, two scripts",
        "Yes, per-event priority",
      ],
      ["Click to focus the window", "No", "No", "Yes (Windows)"],
      ["Every agent, one config", "No", "Repeat per agent", "Yes"],
      ["Snooze / quiet hours", "No", "No", "Yes"],
      ["Setup time", "1 setting", "10–20 min per agent", "One command"],
    ],
  },
  {
    kind: "p",
    text: "anotifier is free, open source (AGPL-3.0), has zero dependencies, and uninstalls cleanly with `anotifier uninstall`. Full reference in the [docs](/docs/).",
  },
];

export const GUIDES: Guide[] = [
  {
    slug: "claude-code-notifications",
    agentSlug: "claude-code",
    agentName: "Claude Code",
    icon: "/assets/icons/claude.png",
    title: "How to Get Notified When Claude Code Finishes (Every Method, 2026)",
    description:
      "Four ways to get alerted when Claude Code finishes or needs input: the built-in terminal setting, a Stop hook, an ntfy phone push, or anotifier. Copy-paste configs.",
    h1: "How to get notified when Claude Code finishes or needs you",
    intro:
      "Claude Code runs for minutes at a time, and the moment it stops is easy to miss: a finished refactor sits idle, or a permission prompt waits unnoticed. Claude Code exposes two hook events that fire at exactly those moments, `Stop` and `Notification`, and everything below builds on them. Here are all the ways to turn them into an alert, from the zero-install setting to a full multi-agent setup.",
    sections: [
      {
        id: "built-in",
        title: "Option 1: Claude Code's built-in terminal notifications",
        blocks: [
          {
            kind: "p",
            text: "Some terminals already surface a system notification when Claude Code finishes or pauses for permission. Claude Code's docs list iTerm2, Kitty, and Ghostty as terminals with native support. Elsewhere you can ask for a terminal bell with the `preferredNotifChannel` setting in `~/.claude/settings.json`:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "preferredNotifChannel": "terminal_bell" }',
          },
          {
            kind: "p",
            text: "What you get: a beep or a plain banner on the same machine, with no project name, no message content, and nothing on your phone. If Claude Code lives in a VS Code panel you often will not hear it.",
          },
        ],
      },
      {
        id: "hook",
        title: "Option 2: a Stop and Notification hook you write yourself",
        blocks: [
          {
            kind: "p",
            text: "Hooks are shell commands Claude Code runs on lifecycle events, configured under `hooks` in `~/.claude/settings.json`. `Stop` fires when Claude finishes a turn; `Notification` fires when it needs your attention (permission prompts, questions, and the idle reminder about a minute after a turn ends). A minimal macOS example:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": {\n    "Stop": [\n      {\n        "hooks": [\n          {\n            "type": "command",\n            "command": "osascript -e \'display notification \\"Claude finished\\" with title \\"Claude Code\\"\'"\n          }\n        ]\n      }\n    ],\n    "Notification": [\n      {\n        "hooks": [\n          {\n            "type": "command",\n            "command": "osascript -e \'display notification \\"Claude needs your input\\" with title \\"Claude Code\\"\'"\n          }\n        ]\n      }\n    ]\n  }\n}',
          },
          {
            kind: "p",
            text: 'On Linux swap the command for `notify-send "Claude Code" "Claude finished"`; on Windows you need a PowerShell script that calls the BurntToast module. The hook receives a JSON payload on stdin (session id, working directory, transcript path, and for `Notification` the message), so a longer script can read the project name and even the last assistant message out of the transcript.',
          },
          {
            kind: "note",
            text: "Keep hook commands fast and never let them fail loudly: Claude Code waits for the hook, and a non-zero exit with output can surface as an error in the session.",
          },
        ],
      },
      {
        id: "phone",
        title: "Option 3: a push notification to your phone with ntfy",
        blocks: [
          {
            kind: "p",
            text: "[ntfy](https://ntfy.sh) is a free, open-source push service with Android and iOS apps and no account. Install the app, subscribe to a topic name only you know, and make the hook POST to it:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": {\n    "Stop": [\n      {\n        "hooks": [\n          {\n            "type": "command",\n            "command": "curl -s -d \'Claude finished\' -H \'Title: Claude Code\' https://ntfy.sh/your-secret-topic"\n          }\n        ]\n      }\n    ]\n  }\n}',
          },
          {
            kind: "p",
            text: "Because public ntfy.sh topics are guessable, send generic text only, or run your own ntfy server before putting conversation content in the body.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "Option 4: anotifier, all of the above in one command",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "The wizard detects Claude Code, registers the `Stop` and `Notification` hooks in `~/.claude/settings.json` (backing the file up first), sets up the desktop toast backend for your OS, and offers to create an ntfy topic for phone push. Restart Claude Code and you are done. It also works as a Claude Code plugin: `/plugin marketplace add DevinoSolutions/anotifier-for-claude-codex-cursor` then `/plugin install anotifier@anotifier`.",
          },
          ...WHAT_ANOTIFIER_ADDS,
        ],
      },
    ],
    faqs: [
      {
        q: "Which Claude Code hook fires when it finishes?",
        a: "Stop. It fires once per completed turn. Notification fires when Claude needs your input: a permission prompt, a question, or the idle reminder it sends about a minute after finishing.",
      },
      {
        q: "Can I get a notification with what Claude actually said?",
        a: "Yes. The hook payload includes the transcript path. anotifier reads the last assistant message (or the question, for needs-input events) from it and puts that in the toast and webhook body, with the project name in the title.",
      },
      {
        q: "Does this work when Claude Code runs inside VS Code?",
        a: "Yes. Hooks are part of Claude Code itself and fire identically in the VS Code extension and the integrated terminal. anotifier adds click-to-focus on Windows so the toast brings the right window forward.",
      },
      {
        q: "Will notifications slow Claude Code down?",
        a: "Not noticeably. Claude Code waits for hooks to exit; anotifier's hook returns within its 10-second timeout and delivers channels in the background, and it always exits 0 so it can never stall a session.",
      },
    ],
  },
  {
    slug: "codex-cli-notifications",
    agentSlug: "codex",
    agentName: "Codex CLI",
    icon: "/assets/icons/codex.png",
    title:
      "Codex CLI Notifications: Get Alerted When Codex Finishes or Asks for Approval",
    description:
      "Desktop, phone, or Slack alerts when Codex CLI finishes or waits for approval: the notify setting, Stop and PermissionRequest hooks, or anotifier in one command.",
    h1: "How to get notified when Codex CLI finishes or needs approval",
    intro:
      "Codex CLI has two moments worth a notification: the end of a turn, and the approval prompt that blocks everything until you answer it. Codex exposes both through its own configuration, so no wrapper process is needed. Here is every way to wire them up.",
    sections: [
      {
        id: "notify",
        title: "Option 1: Codex's notify command in config.toml",
        blocks: [
          {
            kind: "p",
            text: "Codex CLI can run an external program when a turn completes via the `notify` setting in `~/.codex/config.toml`. Codex invokes it with a JSON argument describing the event, and your script turns that into a toast, sound, or push:",
          },
          {
            kind: "code",
            lang: "toml",
            code: 'notify = ["python3", "/Users/you/codex-notify.py"]',
          },
          {
            kind: "p",
            text: "What you get: turn-complete alerts only, with whatever your script does. Approval prompts are not covered by `notify`, which is the moment you most need to hear about.",
          },
        ],
      },
      {
        id: "hooks",
        title: "Option 2: Codex hooks (Stop and PermissionRequest)",
        blocks: [
          {
            kind: "p",
            text: "Codex CLI 0.144 and newer ship a hooks system modelled on Claude Code's. Hooks live in `~/.codex/hooks.json` and must be enabled with `hooks = true` under `[features]` in `config.toml`. The `Stop` event fires when the turn ends and `PermissionRequest` fires when Codex asks to run a command. A hook entry looks like this:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": {\n    "Stop": [\n      {\n        "hooks": [\n          { "type": "command", "command": "notify-send \\"Codex\\" \\"Turn complete\\"", "timeout": 10 }\n        ]\n      }\n    ],\n    "PermissionRequest": [\n      {\n        "hooks": [\n          { "type": "command", "command": "notify-send -u critical \\"Codex\\" \\"Needs approval\\"", "timeout": 10 }\n        ]\n      }\n    ]\n  }\n}',
          },
          {
            kind: "note",
            text: "Codex records a trust hash for every hook it runs, keyed by file path, event, and position, under `[hooks.state]` in `config.toml`. Editing a hook command by hand invalidates the hash until Codex re-trusts it. anotifier writes the hash for you and removes it on uninstall.",
          },
        ],
      },
      {
        id: "anotifier",
        title:
          "Option 3: anotifier, one command for Codex and every other agent",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "The wizard detects `~/.codex`, writes `Stop`, `PermissionRequest`, and `SessionStart` hooks into `~/.codex/hooks.json`, enables the hooks feature flag, records the trust hashes, and backs up both files first. A finished turn arrives as `my-app · Codex` at default priority; an approval request arrives urgent, on your desktop and phone, so the run never sits blocked while you are in another window. The approval path is proven in CI by driving the real Codex TUI through a permission modal.",
          },
          ...WHAT_ANOTIFIER_ADDS,
        ],
      },
    ],
    faqs: [
      {
        q: "Does Codex CLI have built-in desktop notifications?",
        a: "Codex's TUI can emit terminal notifications that some terminals (iTerm2, Ghostty, WezTerm and others) display as system notifications; the notify setting in config.toml runs your own program on turn completion. Neither covers approval prompts on their own, and neither reaches your phone.",
      },
      {
        q: "How do I know when Codex is waiting for approval?",
        a: "Use the PermissionRequest hook (Codex CLI 0.144+). anotifier registers it during setup and delivers it as an urgent notification on every channel you enabled.",
      },
      {
        q: "Can I approve the command from the notification?",
        a: "Not with anotifier today. It gets you back to the terminal fast (click-to-focus on Windows); the decision stays at the keyboard. Remote approval is on the roadmap behind a security review.",
      },
      {
        q: "Does anotifier change how Codex runs?",
        a: "No. It only listens to events Codex already emits. It never wraps, proxies, or slows the agent, and hook errors are logged instead of surfacing in the session.",
      },
    ],
  },
  {
    slug: "cursor-agent-notifications",
    agentSlug: "cursor",
    agentName: "Cursor",
    icon: "/assets/icons/cursor.png",
    title:
      "Cursor Agent Notifications: Get Pinged When the Cursor Agent Finishes",
    description:
      "Get a desktop toast, phone push, or chat message when the Cursor agent finishes: the completion sound, a stop hook in ~/.cursor/hooks.json, or anotifier in one command.",
    h1: "How to get notified when the Cursor agent finishes",
    intro:
      "You kick off a Cursor agent, switch to a browser tab, and check back either too early or twenty minutes late. Cursor exposes an agent lifecycle hook system that fires the instant the agent loop ends, which is all you need to be told rather than to keep checking.",
    sections: [
      {
        id: "built-in",
        title: "Option 1: Cursor's own completion sound",
        blocks: [
          {
            kind: "p",
            text: "Cursor's settings include an option to play a sound when the agent completes. It is a sound on the same machine: no banner with the project name, nothing when you have headphones off or have walked away, and nothing in Slack.",
          },
        ],
      },
      {
        id: "hook",
        title: "Option 2: a stop hook in ~/.cursor/hooks.json",
        blocks: [
          {
            kind: "p",
            text: "Cursor reads agent hooks from `~/.cursor/hooks.json` (and from `.cursor/hooks.json` inside a project). The `stop` event runs when the agent loop ends. Each entry is a command Cursor executes with the event JSON on stdin:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "version": 1,\n  "hooks": {\n    "stop": [\n      { "command": "notify-send \\"Cursor\\" \\"Agent finished\\"" }\n    ]\n  }\n}',
          },
          {
            kind: "p",
            text: "On macOS use `osascript -e \\'display notification ...\\'`; on Windows a PowerShell script with BurntToast. Cursor can fire `stop` twice for a single run, so a hand-written hook may notify twice unless you de-duplicate.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "Option 3: anotifier",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "The wizard detects `~/.cursor`, adds the `stop` hook (backing up `hooks.json` first), and routes the event to your desktop, phone, and webhook. Duplicate `stop` fires within 1.5 seconds collapse into one notification through an atomic lock, and on Windows clicking the toast focuses the exact Cursor window that owns the agent. Cursor exposes no transcript to hooks, so the body is the generic `my-app: Task complete`; the project name is always in the title.",
          },
          ...WHAT_ANOTIFIER_ADDS,
        ],
      },
    ],
    faqs: [
      {
        q: "Does this need a Cursor extension?",
        a: "No. Cursor's hook system is read from a JSON file; nothing is installed into the editor.",
      },
      {
        q: "Can I get Cursor alerts on my phone?",
        a: "Yes, through ntfy: install the app, let anotifier setup create a topic, subscribe, and your phone buzzes when the agent finishes.",
      },
      {
        q: "Why did I get two notifications for one run?",
        a: "Cursor can emit the stop event twice. anotifier de-duplicates identical events within 1.5 seconds; a hand-written hook needs its own guard.",
      },
    ],
  },
  {
    slug: "gemini-cli-notifications",
    agentSlug: "gemini-cli",
    agentName: "Gemini CLI",
    icon: "/assets/icons/gemini.png",
    title:
      "Gemini CLI Notifications: Alerts When Your Gemini Agent Finishes or Needs Input",
    description:
      "Desktop, phone, or webhook alerts when Gemini CLI finishes a run or needs attention: AfterAgent and Notification hooks by hand, or anotifier in one command.",
    h1: "How to get notified when Gemini CLI finishes",
    intro:
      "Gemini CLI runs long agentic loops in the terminal and supports lifecycle hooks in its settings file. `AfterAgent` fires when the agent loop completes and `Notification` fires when the CLI needs your attention. Both can run any command, which is the basis for every option below.",
    sections: [
      {
        id: "hook",
        title: "Option 1: hooks in ~/.gemini/settings.json",
        blocks: [
          {
            kind: "p",
            text: "Gemini CLI reads hooks from `~/.gemini/settings.json` (not from a separate hooks.json). The shape mirrors Claude Code's:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": {\n    "AfterAgent": [\n      {\n        "hooks": [\n          { "type": "command", "command": "notify-send \\"Gemini CLI\\" \\"Run complete\\"" }\n        ]\n      }\n    ],\n    "Notification": [\n      {\n        "hooks": [\n          { "type": "command", "command": "notify-send -u critical \\"Gemini CLI\\" \\"Needs attention\\"" }\n        ]\n      }\n    ]\n  }\n}',
          },
          {
            kind: "p",
            text: "Swap the command per OS as in the other guides. Phone push works the same way as for Claude Code: `curl -d 'Gemini finished' https://ntfy.sh/your-secret-topic`.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "Option 2: anotifier",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "The wizard detects `~/.gemini`, registers `AfterAgent` and `Notification` in `settings.json` with a backup, and cleans up any stale `hooks.json` from older versions. Completed runs arrive as `my-app · Gemini`; attention requests arrive urgent. Gemini CLI is driven end to end in CI on Linux and macOS, hard-failing if the hook does not deliver a real push.",
          },
          ...WHAT_ANOTIFIER_ADDS,
        ],
      },
    ],
    faqs: [
      {
        q: "Which Gemini CLI hook fires when the agent is done?",
        a: "AfterAgent. Notification fires when the CLI needs your attention. Both are configured under hooks in ~/.gemini/settings.json.",
      },
      {
        q: "Does the notification include what Gemini said?",
        a: "No. Gemini CLI does not expose a transcript to hooks, so the body is the generic completion text and the project name is in the title. Rich content is Claude Code-only today.",
      },
      {
        q: "Can I use anotifier for Gemini CLI and Claude Code at the same time?",
        a: "Yes. One config covers every supported agent, and all of them deliver to the same toast, ntfy topic, and webhook.",
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
