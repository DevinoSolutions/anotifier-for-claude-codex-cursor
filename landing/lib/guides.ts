import type { Block, DocFaq } from "./docs";
import { CLAUDE_GUIDES } from "./claude-guides";
import { CODEX_GUIDES } from "./codex-guides";
import { TOPIC_GUIDES } from "./topic-guides";

/**
 * Long-form "how do I get notified when X finishes" guides: one per agent,
 * plus topic guides for platforms and features every agent shares.
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
  /** Last significant edit of this page's content (YYYY-MM-DD): the
      sitemap <lastmod>. Bump it when you change the entry, not on every build. */
  updated: string;
  /** "agent": how to get notified by one agent. "topic": a platform or
      feature (Windows, hooks, ntfy, troubleshooting) across every agent. */
  kind: "agent" | "topic";
  /** Agent slug on this site, for cross-links (/claude-code/ etc.). */
  agentSlug?: string;
  /** Short label for the kicker, cards, and breadcrumb. */
  name: string;
  icon?: string;
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
    head: ["Feature", "Built-in", "DIY hook", "anotifier"],
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

/** Cursor's stop event carries no working directory and anotifier hooks only
    `stop`, so three of the shared rows don't hold for Cursor. */
const CURSOR_ROWS: Record<string, string> = {
  "Names the project": "No, the title is `Cursor`",
  "Urgent for approvals, calm for done": "No, finished runs only",
  "Click to focus the window": "No",
};

const WHAT_ANOTIFIER_ADDS_CURSOR: Block[] = WHAT_ANOTIFIER_ADDS.map((block) =>
  block.kind === "table"
    ? {
        ...block,
        rows: block.rows.map((row) =>
          row[0] in CURSOR_ROWS
            ? [...row.slice(0, 3), CURSOR_ROWS[row[0]]]
            : row,
        ),
      }
    : block,
);

const AGENT_GUIDES: Guide[] = [
  {
    slug: "claude-code-notifications",
    updated: "2026-10-07",
    kind: "agent",
    agentSlug: "claude-code",
    name: "Claude Code",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Notification When It Finishes: Desktop & Phone",
    description:
      "Add a Stop hook for finished turns and a Notification hook for input prompts to ~/.claude/settings.json. Configs for a macOS banner, the bell and ntfy push.",
    h1: "How to get notified when Claude Code finishes or needs you",
    intro:
      "Add two hooks to `~/.claude/settings.json`: `Stop`, which fires when Claude finishes a turn, and `Notification`, which fires when it needs your permission or input. Point each at a command that shows a banner, plays a sound, or sends a push to your phone. Or run `npx anotifier@latest setup`, which wires both for you. Below is every option, from the one-line setting to a full multi-agent setup, with configs you can paste.",
    sections: [
      {
        id: "built-in",
        title: "Option 1: Claude Code's built-in terminal notifications",
        blocks: [
          {
            kind: "p",
            text: "Out of the box, Claude Code sends a desktop notification when it finishes or pauses for permission, but only in Ghostty, Kitty, and iTerm2. In any other terminal, set `preferredNotifChannel` in `~/.claude/settings.json` to ring the terminal bell instead:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "preferredNotifChannel": "terminal_bell" }',
          },
          {
            kind: "ul",
            items: [
              "Ghostty and Kitty pass the notification to your OS notification center with no setup. iTerm2 needs **Settings > Profiles > Terminal > Notification Center Alerts** checked, with **Send escape sequence-generated alerts** enabled under Filter Alerts.",
              "The notification reaches your local machine over SSH, so a remote session can still alert you.",
              "Inside tmux, add `set -g allow-passthrough on` to `~/.tmux.conf`, or the notification never reaches the outer terminal.",
            ],
          },
          {
            kind: "p",
            text: "What you get: a beep or a plain banner on the machine you are sitting at, with no project name, no message content, and nothing on your phone. Terminals without the built-in notification, such as Warp or the VS Code integrated terminal, need the bell or a hook. For the bell and custom sounds, see [Claude Code notification sounds](/guides/claude-code-notification-sound/).",
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
            kind: "ul",
            items: [
              "**macOS**: `osascript` banners come from Script Editor. If Script Editor has no notification permission, the command fails silently and macOS never asks. Run `osascript -e 'display notification \"test\"'` once, then allow Script Editor in **System Settings > Notifications**.",
              '**Linux**: use `notify-send "Claude Code" "Claude finished"`. It needs a desktop notification daemon, which headless servers, SSH sessions, and most containers lack; install `libnotify-bin` on Debian and Ubuntu if the command is missing.',
              "**Windows**: Claude Code's docs use a PowerShell `MessageBox`, which is a dialog box and can open behind your terminal. A real toast needs a PowerShell module such as BurntToast. Inside WSL, `powershell.exe` must be reachable through Windows interop.",
            ],
          },
          {
            kind: "p",
            text: 'Without a matcher, the `Notification` hook runs for every notification type, including ones that don\'t need you, such as `auth_success`. To alert only on approvals, set `"matcher": "permission_prompt"`; `idle_prompt` is the reminder Claude Code sends about 60 seconds after it finishes. The [permission notifications guide](/guides/claude-code-permission-notifications/) lists every type and its timing.',
          },
          {
            kind: "p",
            text: "The hook receives a JSON payload on stdin: session id, working directory, transcript path, and for `Notification` the `message` and `notification_type`. A longer script can read the project name, and even the last assistant message, out of the transcript. Type `/hooks` in Claude Code to check what is registered.",
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
        a: "Not noticeably. Claude Code waits for the hook to exit, and anotifier sends every channel in parallel, each with its own 5 to 7 second timeout. It registers its hook with a 10-second timeout (Claude Code's default for command hooks is 600 seconds) and always exits 0, so it can never stall a session.",
      },
      {
        q: "Why am I not getting Claude Code notifications?",
        a: "The built-in desktop notification only works in Ghostty, Kitty and iTerm2; elsewhere set preferredNotifChannel to terminal_bell or add a hook. With a hook, restart Claude Code and check /hooks. On macOS, allow Script Editor in System Settings > Notifications; inside tmux, turn on allow-passthrough.",
      },
      {
        q: "How do I get notified only when Claude Code needs permission?",
        a: 'Give the Notification hook "matcher": "permission_prompt". It fires when an approval has waited about six seconds. The permission notifications guide covers every notification type.',
      },
      {
        q: "Can Claude Code play a sound when it finishes?",
        a: "Yes. Set preferredNotifChannel to terminal_bell for the terminal bell, or add a Stop hook that plays a sound file, such as afplay /System/Library/Sounds/Glass.aiff on macOS. The notification sound guide has commands for Linux and Windows.",
      },
    ],
  },
  {
    slug: "codex-cli-notifications",
    updated: "2026-10-06",
    kind: "agent",
    agentSlug: "codex",
    name: "Codex CLI",
    icon: "/assets/icons/codex.png",
    title: "Codex CLI Notifications: Get Alerted When Codex Finishes",
    description:
      "By default Codex CLI alerts you only in the background. Get finish and approval alerts on your desktop or phone: [tui] settings, notify, or hooks.",
    h1: "How to get notified when Codex CLI finishes or needs approval",
    intro:
      "Codex CLI already notifies you when a turn ends or an approval is waiting, but by default only while its terminal is in the background: a desktop notification in Ghostty, iTerm2, Kitty, Warp and WezTerm, and the terminal bell everywhere else. For alerts you can't miss, add `Stop` and `PermissionRequest` hooks to `~/.codex/hooks.json`, or run `npx anotifier@latest setup` to send both to your desktop and phone. Here is every option. To make Codex ding when it needs a response, see [Codex CLI notification sounds](/guides/codex-notification-sound/).",
    sections: [
      {
        id: "builtin",
        title: "Option 1: Codex's built-in TUI notifications",
        blocks: [
          {
            kind: "p",
            text: "The Codex TUI notifies you out of the box when a turn ends, when it asks to run a command or edit files, and when a Plan mode prompt or a question is waiting. In Ghostty, iTerm2, Kitty, Warp, and WezTerm it sends an OSC 9 desktop notification; in any other terminal it rings the bell. By default it does this only while the terminal is unfocused. Tune it under `[tui]` in `~/.codex/config.toml`:",
          },
          {
            kind: "code",
            lang: "toml",
            code: '[tui]\nnotifications = ["agent-turn-complete", "approval-requested"]\nnotification_method = "auto"      # or "osc9", "bel"\nnotification_condition = "always" # default "unfocused"',
          },
          {
            kind: "p",
            text: "What you get: alerts in this machine's terminal only, nothing on your phone, and no sound if the terminal's bell is muted. To make approvals ding, see [Codex notification sounds](/guides/codex-notification-sound/).",
          },
        ],
      },
      {
        id: "notify",
        title: "Option 2: Codex's notify command in config.toml",
        blocks: [
          {
            kind: "p",
            text: "Codex CLI can run an external program through the `notify` setting in `~/.codex/config.toml`. Codex currently sends it one event, `agent-turn-complete`, as a JSON argument with fields such as `thread-id`, `last-assistant-message`, and `input-messages`. Your script turns that into a toast, sound, or push. Codex ignores `notify` in a project's `.codex/config.toml`, so set it in your user config:",
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
        title: "Option 3: Codex hooks (Stop and PermissionRequest)",
        blocks: [
          {
            kind: "p",
            text: "Codex CLI 0.144 and newer ship a hooks system modelled on Claude Code's. Hooks live in `~/.codex/hooks.json` and are on by default in current releases (early ones needed `hooks = true` under `[features]` in `config.toml`). `Stop` fires when the turn ends. `PermissionRequest` fires when Codex is about to ask for approval, and only then. A hook entry looks like this:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": {\n    "Stop": [\n      {\n        "hooks": [\n          { "type": "command", "command": "notify-send \\"Codex\\" \\"Turn complete\\"", "timeout": 10 }\n        ]\n      }\n    ],\n    "PermissionRequest": [\n      {\n        "hooks": [\n          { "type": "command", "command": "notify-send -u critical \\"Codex\\" \\"Needs approval\\"", "timeout": 10 }\n        ]\n      }\n    ]\n  }\n}',
          },
          {
            kind: "note",
            text: "Codex records a trust hash for every hook it runs, keyed by file path, event, and position, under `[hooks.state]` in `config.toml`, and skips a new or edited hook until you trust it with `/hooks` in Codex. anotifier writes the hash for you and removes it on uninstall.",
          },
        ],
      },
      {
        id: "anotifier",
        title:
          "Option 4: anotifier, one command for Codex and every other agent",
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
        a: "Yes. The Codex TUI notifies when a turn ends and when an approval, Plan mode prompt, or question is waiting: an OSC 9 desktop notification in Ghostty, iTerm2, Kitty, Warp and WezTerm, the terminal bell elsewhere, and by default only while the terminal is unfocused. It doesn't reach your phone.",
      },
      {
        q: "How do I know when Codex is waiting for approval?",
        a: "Codex's built-in approval-requested notification covers it on your machine. For an alert on your phone or on every channel, use the PermissionRequest hook (Codex CLI 0.144+); anotifier registers it during setup and delivers it as an urgent notification on every channel you enabled.",
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
    updated: "2026-10-06",
    kind: "agent",
    agentSlug: "cursor",
    name: "Cursor",
    icon: "/assets/icons/cursor.png",
    title: "Cursor Notification When Done: Agent Finish Alerts",
    description:
      "Turn on Cursor's completion sound, or add a stop hook to ~/.cursor/hooks.json for a desktop toast, phone push, or Slack message when the agent finishes.",
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
            text: "On macOS use `osascript -e 'display notification ...'`; on Windows a PowerShell script with BurntToast. Cursor can fire `stop` twice for a single run, so a hand-written hook may notify twice unless you de-duplicate.",
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
            text: "The wizard detects `~/.cursor`, adds the `stop` hook (backing up `hooks.json` first), and routes the event to your desktop, phone, and webhook. Duplicate `stop` fires within 1.5 seconds collapse into one notification through an atomic lock. The alert is titled `Cursor` and says `Task complete`: Cursor's `stop` event carries no working directory, so the project name isn't in it and a click on the Windows toast can't find the window, and anotifier doesn't read the event's `status`, so an aborted run says the same. anotifier hooks only `stop`, so it doesn't tell you when the agent is waiting for you.",
          },
          ...WHAT_ANOTIFIER_ADDS_CURSOR,
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
        a: "Cursor can emit the stop event twice. anotifier drops a repeat of the same event from the same session within 1.5 seconds; a hand-written hook needs its own guard.",
      },
    ],
  },
  {
    slug: "gemini-cli-notifications",
    updated: "2026-10-08",
    kind: "agent",
    agentSlug: "gemini-cli",
    name: "Gemini CLI",
    icon: "/assets/icons/gemini.png",
    title: "Gemini CLI Notifications: Alerts When the Agent Finishes",
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
            text: "The wizard detects `~/.gemini`, registers `AfterAgent` and `Notification` in `settings.json` with a backup, and cleans up any stale `hooks.json` from older versions. Completed runs arrive as `my-app · Gemini`; attention requests arrive urgent. Gemini CLI is driven end to end in CI on Linux and macOS, hard-failing if the `AfterAgent` hook does not deliver a real push.",
          },
          ...WHAT_ANOTIFIER_ADDS,
        ],
      },
      {
        id: "antigravity",
        title: "Moved to Antigravity CLI?",
        blocks: [
          {
            kind: "p",
            text: "On June 18, 2026 Google stopped serving Gemini CLI to Google AI Pro and Ultra subscribers and free Gemini Code Assist users, and moved them to Antigravity CLI. Gemini CLI keeps working with a Gemini API key or a Code Assist Standard or Enterprise license, and everything above applies to it.",
          },
          {
            kind: "p",
            text: 'Antigravity CLI has hooks too, in a new format: it reads them from files such as `~/.gemini/config/hooks.json` or a workspace\'s `.agents/hooks.json`, and its events are `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`. There is no `AfterAgent` or `Notification` event, so the Gemini CLI hooks above don\'t fire there. anotifier 1.4.0 and later support it separately: `npx anotifier setup` adds one group named `anotifier` with a `Stop` handler to `~/.gemini/config/hooks.json` when `~/.gemini/antigravity-cli` exists, and a finished run sends "Task complete". Limits: there is no needs-input alert (Antigravity has no such event), a `Stop` caused by an error or cancel also says "Task complete", and it has not yet been tested against a live Antigravity CLI. Google\'s [Antigravity hooks docs](https://antigravity.google/docs/hooks/) describe the format.',
          },
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
        a: "No. anotifier sends the generic completion text for Gemini CLI, with the project name in the title. Showing the agent's own words is Claude Code-only today.",
      },
      {
        q: "Can I use anotifier for Gemini CLI and Claude Code at the same time?",
        a: "Yes. One config covers every supported agent, and all of them deliver to the same toast, ntfy topic, and webhook.",
      },
      {
        q: "Does this work with Antigravity CLI?",
        a: 'Yes, from anotifier 1.4.0: run npx anotifier setup and it adds an anotifier group with a Stop handler to ~/.gemini/config/hooks.json. You get a "Task complete" alert; there is no needs-input alert, a stop caused by an error or cancel also says "Task complete", and it has not yet been tested against a live Antigravity CLI. Gemini CLI hooks don\'t fire there, since Antigravity has no AfterAgent or Notification event. Gemini CLI itself still works with a Gemini API key or a Code Assist Standard or Enterprise license.',
      },
    ],
  },
];

export const GUIDES: Guide[] = [
  ...AGENT_GUIDES,
  ...CLAUDE_GUIDES,
  ...CODEX_GUIDES,
  ...TOPIC_GUIDES,
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export const GUIDES_TITLE =
  "Notification Guides for Claude Code, Codex, Cursor & Gemini";
export const GUIDES_DESCRIPTION =
  "Guides to notifications from Claude Code, Codex CLI, Cursor and Gemini CLI: per-agent setup, Windows, WSL, macOS, Linux, hooks, phone push and fixes.";
