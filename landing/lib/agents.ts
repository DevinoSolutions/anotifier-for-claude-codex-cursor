import type { Block } from "./docs";
import { json } from "./claude-guides";

/**
 * The per-agent product pages (/claude-code/ etc.). They answer "what does
 * anotifier do for X": the hooks it registers, the exact entries setup writes,
 * what each alert says, and the limits. Every claim mirrors the CLI source
 * (setup/patch-config.mjs, src/parse-input.mjs, src/router.mjs,
 * config/default-config.json); the how-to for every option, built-in and DIY,
 * lives in the guides these pages link to.
 */

interface AgentHook {
  event: string;
  what: string;
  /** Inline markdown: `code`, **bold**, [text](url). */
  how: string;
}

interface AgentFaq {
  q: string;
  /** Inner HTML of the answer container (simple inline tags: <p>, <code>, <a>). */
  aHtml: string;
}

interface AgentH1 {
  pre: string;
  em: string;
  post: string;
}

interface AgentSection {
  id: string;
  kicker: string;
  title: string;
  blocks: Block[];
}

export interface Agent {
  slug: string;
  /** Last significant edit of this page's content (YYYY-MM-DD): the
      sitemap <lastmod>. Bump it when you change the entry, not on every build. */
  updated: string;
  /** Display name used in breadcrumb, headings, and cross-links (e.g. "Claude Code"). */
  name: string;
  title: string;
  description: string;
  h1: AgentH1;
  sub: string;
  /** Inline markdown callout under the hero, for news that decides whether
      the page applies to the reader at all. */
  notice?: string;
  /** Lede under the "How it hooks in" section. Inline markdown. */
  hooksIntro: string;
  hooks: AgentHook[];
  /** Extra install line, rendered as HTML below the install command (claude-code only). */
  extraInstall?: string;
  /** Agent-specific sections after the hook list: what setup writes, limits. */
  sections: AgentSection[];
  faqs: AgentFaq[];
  /** Anchor text for the guides' link to this page; defaults to "<name> overview". */
  linkText?: string;
  /** Public path to the agent icon. */
  icon: string;
}

const NOTIFY = "/path/to/anotifier/src/notify.mjs";

const CLICK_TO_FOCUS =
  "**Click-to-focus is Windows-only.** Clicking the toast brings forward the window whose title contains the project folder. macOS, Linux and WSL toasts have no click action.";

/** The hand-written Claude Code hook pair, in the shape Claude Code's hooks
    guide gives (https://code.claude.com/docs/en/hooks-guide). */
const BY_HAND_HOOKS = json({
  hooks: {
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command:
              'osascript -e \'display notification "Claude finished" with title "Claude Code"\'',
          },
        ],
      },
    ],
    Notification: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command:
              'osascript -e \'display notification "Claude needs your input" with title "Claude Code"\'',
          },
        ],
      },
    ],
  },
});

const BY_HAND_COMMANDS = `# macOS
osascript -e 'display notification "Claude finished" with title "Claude Code"'

# Linux (needs a notification daemon; on Debian/Ubuntu libnotify-bin provides notify-send)
notify-send 'Claude Code' 'Claude finished'

# Windows (PowerShell)
powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Claude finished', 'Claude Code')"`;

export const AGENTS: Agent[] = [
  {
    slug: "claude-code",
    updated: "2026-10-15",
    name: "Claude Code",
    linkText: "Claude Code notifier",
    title: "Claude Code Notifier — Desktop, Phone & Slack Alerts",
    description:
      "anotifier is a free Claude Code notifier for Windows, macOS, Linux and WSL: a desktop, phone or Slack alert when Claude finishes or needs input.",
    h1: {
      pre: "anotifier: the ",
      em: "Claude Code notifier",
      post: " for desktop, phone and Slack.",
    },
    sub: "anotifier is a free, open-source Claude Code notifier. The moment Claude Code finishes a turn, asks for permission or waits for your input, it sends a desktop toast, a phone push, or a Slack, Discord or Telegram message, on Windows, macOS, Linux and WSL, in a terminal or in VS Code. Run the command below once (start Claude Code once first, so its settings file exists). Claude Code picks up the new hooks on its own; if /hooks doesn't list them, restart it.",
    hooksIntro:
      "Setup adds two hook entries to Claude Code's own `~/.claude/settings.json`, plus a `statusLine` entry that routes the statusline through anotifier (1.5.0 and later). The hooks run inside Claude Code itself, with no wrapper process.",
    hooks: [
      {
        event: "Stop",
        what: "Claude Code finished its turn",
        how: "Titled `my-app · Claude Code`. On the toast and on webhooks the body is the start of Claude's last reply, up to 180 characters; phone push says `my-app: Task complete` unless you turn on rich content. If background tasks are still running, the alert waits for the real finish.",
      },
      {
        event: "Notification",
        what: "Claude Code needs you",
        how: "Claude's own message is the body, such as a permission request or a question, sent urgent when Claude is blocked on you. The idle reminder (“Claude is waiting for your input”) goes out at normal priority, because nothing is blocked.",
      },
    ],
    extraInstall:
      "Or install it as a Claude Code plugin, in two steps: <code>/plugin marketplace add DevinoSolutions/anotifier-for-claude-codex-cursor</code> then <code>/plugin install anotifier@anotifier</code>",
    sections: [
      {
        id: "options",
        kicker: "[ THE OPTIONS ]",
        title: "The ways to get Claude Code notifications.",
        blocks: [
          {
            kind: "p",
            text: "Searching for a Claude Code notifier turns up five kinds of tool: Claude Code's own notifications, companion apps, native macOS tools, VS Code extensions, and hooks. Each suits someone. Facts about other projects come from their own pages, linked below, and may have changed since 2026-10-15.",
          },
          {
            kind: "table",
            head: ["Option", "Good for", "Where it stops"],
            rows: [
              [
                "Claude Code's built-in notifications",
                "No setup. By default Claude Code sends a desktop notification only in Ghostty, Kitty and iTerm2, and `preferredNotifChannel` set to `terminal_bell` rings the bell in other terminals ([Claude Code docs](https://code.claude.com/docs/en/terminal-config#get-a-terminal-bell-or-notification)).",
                "A desktop notification or a bell on the machine running Claude Code. Phone push needs Remote Control and the Claude mobile app, and in the 'Push when Claude decides' mode Claude chooses when to send ([docs](https://code.claude.com/docs/en/remote-control#mobile-push-notifications)).",
              ],
              [
                "Companion apps, such as [Claude Code Notifier (claudecodenotifier.com)](https://claudecodenotifier.com)",
                "A macOS menu bar app with iOS and Android apps. Its page says you can approve permission requests and reply from your phone (mobile response needs iTerm2).",
                "The desktop app needs macOS 14 or later, and its page lists no Windows or Linux desktop app. Its mobile features are on a paid plan, per its pricing.",
              ],
              [
                "Native macOS tools, such as [kovoor/claude-code-opencode-notifier](https://github.com/kovoor/claude-code-opencode-notifier)",
                "MIT-licensed native macOS banners for Claude Code and OpenCode, showing which Ghostty tab or project raised them.",
                "macOS only, needs `jq`, and works best in Ghostty.",
              ],
              [
                "VS Code extensions, such as [Claude Code Notifier (VS Code extension by Erdem Giray)](https://marketplace.visualstudio.com/items?itemName=erdemgiray.claude-code-notifier)",
                "Free. Different sounds and banners for permission, question and finished (off by default) events inside the VS Code window with the project open, and it installs its own hooks on first run. Per its listing it works over SSH, WSL and containers with a local companion extension.",
                "Built for VS Code: the banners come from the extension, so VS Code needs to be running.",
              ],
              [
                "Hooks you write yourself",
                "Free, any OS, no extra software. The next section has a working pair.",
                "One command per OS and fixed text. Every extra (project name, what Claude said, phone push, priority) is a script you maintain.",
              ],
              [
                "**anotifier**",
                "One command wires `Stop` and `Notification` hooks. Desktop toasts on Windows, macOS, Linux and WSL, phone push over [ntfy](/phone/) with no account, [Slack](/slack/), [Discord](/discord/), [Telegram](/telegram/) or any webhook, and the same config for [Codex CLI](/codex/), [Cursor](/cursor/) and [Gemini CLI](/gemini-cli/). Free and open source (AGPL-3.0).",
                "A command-line tool with no menu bar app or GUI. It alerts you; you answer Claude in the terminal. Click-to-focus works on Windows only.",
              ],
            ],
          },
          {
            kind: "p",
            text: "Pick by what you need to reach. One platform and one editor: a companion app or an extension may fit better. More than one OS, your phone or a chat channel, or more than one agent: a hook-based tool like anotifier covers them with one install. For how each hook option works, the [guide to every option](/guides/claude-code-notifications/) walks through them.",
          },
        ],
      },
      {
        id: "by-hand",
        kicker: "[ DO IT BY HAND ]",
        title: "Set up a Claude Code notifier yourself.",
        blocks: [
          {
            kind: "p",
            text: "Claude Code runs hooks: shell commands registered in a settings file. Your user settings file is `~/.claude/settings.json` (`%USERPROFILE%\\.claude\\settings.json` on Windows), and it applies to every project. `Stop` fires when Claude finishes a turn; `Notification` fires when it is waiting for permission or input. This pair shows a macOS banner for both:",
          },
          { kind: "code", lang: "json", code: BY_HAND_HOOKS },
          {
            kind: "p",
            text: "Swap in the command for your OS. Inside the JSON, write each double quote as \\\" (the macOS and Windows commands both contain some). The Windows one is the dialog box from Claude Code's own docs; it stays on screen until you click OK, so use it for Notification rather than Stop. On macOS, osascript notifications are attributed to Script Editor; if Script Editor is not allowed to send notifications, the command fails silently.",
          },
          { kind: "code", lang: "bash", code: BY_HAND_COMMANDS },
          {
            kind: "ul",
            items: [
              "If the file already has a `hooks` key, add `Stop` and `Notification` next to the events already there rather than replacing the object. Type `/hooks` in Claude Code to check they registered.",
              'The `Notification` hook with an empty matcher runs for every notification type. To alert only for approvals, set `"matcher": "permission_prompt"`; see the [permission notifications guide](/guides/claude-code-permission-notifications/).',
              "Claude Code's documentation names `~/.claude/settings.json` as the user settings file. If you set `CLAUDE_CONFIG_DIR`, Claude Code reads its settings from that folder instead.",
            ],
          },
          {
            kind: "p",
            text: "What anotifier adds on top of this:",
          },
          {
            kind: "ul",
            items: [
              "**A useful message.** The title names the project (`my-app · Claude Code`) and the toast carries the start of Claude's last reply or its question, instead of fixed text.",
              "**Phone and chat in the same hook,** sent to every channel in parallel with a short timeout each, so a dead channel never holds Claude up.",
              "**Priorities.** Permission prompts and questions go out urgent; the idle reminder and informational types go out at normal priority.",
              "**No double alerts.** A repeat of the same event within 1.5 seconds is dropped.",
              "**Snooze and quiet hours,** an `uninstall` that removes only its own entries, and a backup of `settings.json` before it edits.",
              "**Usage and context warnings** through the statusline, covered below.",
            ],
          },
        ],
      },
      {
        id: "setup",
        kicker: "[ WHAT SETUP WRITES ]",
        title: "Two hooks and a statusLine in ~/.claude/settings.json.",
        blocks: [
          {
            kind: "p",
            text: "Setup only wires Claude Code when `~/.claude/settings.json` already exists (on Windows, in the `.claude` folder of your user profile), so start Claude Code once first. It copies the file to `~/.anotifier/backups/`, then adds this entry under `Stop`:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [
                  {
                    hooks: [
                      {
                        type: "command",
                        command: `node "${NOTIFY}" --source claude`,
                        timeout: 10,
                      },
                    ],
                    _managed_by: "anotifier",
                    matcher: "",
                  },
                ],
              },
            }),
          },
          {
            kind: "p",
            text: "`Notification` gets an identical entry. The path points at the anotifier package on your machine, which is the npx cache if you ran it with npx. `_managed_by` is how `status` and `uninstall` tell anotifier's entries from your own hooks. Claude Code gives the hook 10 seconds; anotifier sends to every channel in parallel, each with a shorter timeout, and always exits cleanly, so a dead channel never holds Claude up.",
          },
          {
            kind: "p",
            text: "From 1.5.0, setup also routes the statusline through anotifier, which is how usage-limit warnings (1.5.0) and context warnings (1.6.0) work. It adds this `statusLine` entry; the `--wrap-b64` part appears only if you already had a statusline, and carries your old command, base64-encoded, so it keeps printing:",
          },
          {
            kind: "code",
            lang: "json",
            code: `{
  "statusLine": {
    "type": "command",
    "command": "node \\"…/anotifier/src/statusline.mjs\\" --wrap-b64 <your old command, base64>"
  }
}`,
          },
          {
            kind: "p",
            text: "Installed as a plugin instead? The plugin registers the same two hooks from its own `hooks.json`, and `/anotifier:setup` wires your other agents. Plugin hooks don't show in `anotifier status` and `anotifier uninstall` doesn't remove them; remove the plugin from Claude Code's `/plugin` menu instead.",
          },
        ],
      },
      {
        id: "limits",
        kicker: "[ GOOD TO KNOW ]",
        title: "What it does, and what it doesn't.",
        blocks: [
          {
            kind: "ul",
            items: [
              "**The ding comes from Claude Code itself.** The hook hands Claude Code a bell to print in its own terminal (Claude Code 2.1.141 or newer), so no extra process has to find the right tab. To change the sound or turn it off, see the [Claude Code notification sound guide](/guides/claude-code-notification-sound/).",
              "**Only types that wait on you are urgent.** Permission prompts and questions go out urgent. Informational types such as `agent_completed` arrive at normal priority, and echoes of something you just did, such as `auth_success`, are dropped. The hook has no matcher; the [permission notifications guide](/guides/claude-code-permission-notifications/) shows how to filter by type in a hook you write yourself.",
              "**Needs-input alerts stand out.** They go out urgent, which raises the priority on ntfy and Linux `notify-send`, and toasts play a different sound than for a finished task.",
              CLICK_TO_FOCUS,
              "**Snooze and quiet hours** silence every channel, the bell included: `npx anotifier@latest snooze 2h`.",
            ],
          },
        ],
      },
      {
        id: "usage-limits",
        kicker: "[ USAGE LIMITS ]",
        title: "A warning before you hit a usage limit.",
        blocks: [
          {
            kind: "p",
            text: "Version 1.5.0 and later warns you before Claude Code stops at a usage limit. One notification goes out as your **5-hour** or **weekly** usage crosses **70%, 85% and 95%**, at default, high and urgent priority. It names the chat, the window and when it resets. Usage belongs to your account, so each threshold warns once per window across all your chats.",
          },
          {
            kind: "ul",
            items: [
              "**Claude.ai Pro and Max only.** Claude Code reports usage only to those plans, and only to the statusline command, never to hooks.",
              "**Setup routes your statusline through anotifier.** `anotifier setup` points `statusLine` at `src/statusline.mjs`. A statusline you already have is wrapped and still prints your line; `anotifier uninstall` restores it exactly.",
              "**Toast, ntfy and webhook, never the bell.** Snooze and quiet hours hold warnings back.",
              '**Configurable.** `usageAlerts: { "enabled": true, "thresholds": [70, 85, 95] }` in `~/.anotifier/config.json`.',
            ],
          },
          {
            kind: "p",
            text: "The [usage limit notifications guide](/guides/claude-code-usage-limit-notifications/) has the statusline script to write yourself and the full details.",
          },
        ],
      },
      {
        id: "context-warning",
        kicker: "[ CONTEXT WARNING ]",
        title: "A warning before Claude Code auto-compacts.",
        blocks: [
          {
            kind: "p",
            text: "Version 1.6.0 and later sends **one** notification per chat when its context passes **85%** of the auto-compact window, so you can wrap up or run `/compact` before Claude Code compacts on its own. It names the chat and the size, such as `174K of 200K tokens`, at high priority.",
          },
          {
            kind: "ul",
            items: [
              "**Once per chat.** A chat never warns twice, even after `/compact`. `/clear` starts a new session, which can warn again.",
              "**Measured against the auto-compact window,** from `CLAUDE_CODE_AUTO_COMPACT_WINDOW` or your `/autocompact` setting, else the model's window. Skipped when auto-compact is off. The `--autocompact` flag and managed settings are invisible to a statusline, so the warning can be late or missing with them.",
              "**No subscription needed.** It works on API-key and proxy sessions too, through the same statusline wiring as usage warnings.",
              "**Toast, ntfy and webhook, never the bell.** Snooze and quiet hours hold it back.",
              '**Configurable.** `contextAlerts: { "enabled": true, "threshold": 85 }` in `~/.anotifier/config.json`.',
            ],
          },
          {
            kind: "p",
            text: "The [auto-compact warning guide](/guides/claude-code-auto-compact-warning/) explains how the window is resolved and has a statusline script to write yourself.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "What is the best Claude Code notifier?",
        aHtml:
          '<p>It depends on what you need to reach. On macOS only, a companion app may feel more native. In VS Code only, an extension is closest to the editor. If you want one install that works on Windows, macOS, Linux and WSL, reaches your phone or Slack, and covers Codex CLI, Cursor and Gemini CLI from one config, anotifier is built for that. The Remote Control feature in Claude Code and its mobile app can also push to your phone if you use them. And if you want no extra software, two hooks you write yourself take about ten lines. The <a href="#options">comparison above</a> lists what each option does.</p>',
      },
      {
        q: "Is anotifier free?",
        aHtml:
          "<p>Yes. It is free and open source under AGPL-3.0, with no account and no paid tier. It runs with <code>npx</code> and needs Node.js 18 or newer. Phone push goes through ntfy, which is also free and open source; use the public ntfy.sh server or your own.</p>",
      },
      {
        q: "Does it work on Windows and WSL?",
        aHtml:
          '<p>Yes. On Windows the toast needs PowerShell 7 and the BurntToast module; <code>anotifier setup</code> installs BurntToast for your user. Inside WSL the toast goes to Windows through interop, as a plainer banner without the agent icon, a custom sound or click-to-focus, so run anotifier from the WSL shell where your Claude Code settings live. macOS and Linux work too, with <code>osascript</code> and <code>notify-send</code>. See the <a href="/guides/windows-wsl-notifications/">Windows and WSL guide</a>.</p>',
      },
      {
        q: "Can anotifier warn me before Claude Code auto-compacts?",
        aHtml:
          '<p>Yes, from anotifier 1.6.0. It sends one notification per chat when its context passes 85% of the auto-compact window, so you can wrap up or <code>/compact</code> first. It works on API-key and proxy sessions too, not only Pro and Max. It reads the numbers from Claude Code\'s statusline, which <code>anotifier setup</code> routes through anotifier. See the <a href="/guides/claude-code-auto-compact-warning/">auto-compact warning guide</a>.</p>',
      },
      {
        q: "Can anotifier warn me before Claude Code hits a usage limit?",
        aHtml:
          '<p>Yes, from anotifier 1.5.0 on a Claude.ai Pro or Max plan. It sends one notification when your 5-hour or weekly usage crosses 70%, 85% and 95%, naming the chat and when the window resets. It reads the numbers from Claude Code\'s statusline, which <code>anotifier setup</code> routes through anotifier and wraps around any statusline you already have. See the <a href="/guides/claude-code-usage-limit-notifications/">usage limit notifications guide</a>.</p>',
      },
      {
        q: "How does anotifier integrate with Claude Code?",
        aHtml:
          "<p>It uses Claude Code's native hooks. <code>anotifier setup</code> detects Claude Code and registers <code>Stop</code> and <code>Notification</code> hooks in <code>~/.claude/settings.json</code>, after backing the file up. When Claude Code finishes a turn or asks for input, the hook fires and anotifier routes it to your channels.</p>",
      },
      {
        q: "Does it work with Claude Code inside VS Code?",
        aHtml:
          "<p>Yes. The hooks live in Claude Code's own settings, so they fire the same way in a terminal and in the VS Code extension. On Windows, clicking the toast brings forward the window whose title contains the project folder.</p>",
      },
      {
        q: "What does a Claude Code notification say?",
        aHtml:
          "<p>The title names the project and the agent, like <code>my-app · Claude Code</code>. On the toast and on webhooks the body is what Claude last said, or its question, trimmed to about 180 characters. Phone push through ntfy says <code>my-app: Task complete</code> unless you set <code>ntfy.richContent</code> to <code>true</code>.</p>",
      },
      {
        q: "Can I get Claude Code alerts on my phone?",
        aHtml:
          '<p>Yes — phone push works over <a href="https://ntfy.sh">ntfy</a> on Android and iOS with no account. Your phone buzzes when Claude finishes, even if you\'ve walked away from the desk.</p>',
      },
      {
        q: "Is my code or conversation sent anywhere?",
        aHtml:
          "<p>Nothing goes to us unless you opt in to error reports. An alert goes only to the channels you set up: by default the toast and any webhook get the start of Claude's last message, and ntfy gets a generic line. Separately, anotifier asks the npm registry for the latest version at most once a day; set <code>updateCheck.enabled</code> to <code>false</code> to stop that.</p>",
      },
      {
        q: "How do I remove it?",
        aHtml:
          "<p>Run <code>npx anotifier@latest uninstall</code>. It removes anotifier's two entries, puts your original statusline back (or removes the one setup added), and leaves your own hooks in place. If you installed the plugin, remove it from Claude Code's <code>/plugin</code> menu as well.</p>",
      },
    ],
    icon: "/assets/icons/claude.png",
  },
  {
    slug: "codex",
    updated: "2026-10-09",
    name: "Codex CLI",
    title: "Codex CLI Notifier — Desktop, Phone & Approval Alerts",
    description:
      "anotifier is a free Codex CLI notifier: desktop toasts, phone push, and webhooks when Codex finishes a task or asks for approval. One command to set up.",
    h1: { pre: "anotifier for ", em: "Codex CLI", post: "." },
    sub: "Codex works quietly in your terminal until it's done — or until it's stuck waiting for you to approve a command. anotifier turns both moments into notifications on your desktop, phone, or team chat.",
    hooksIntro:
      "Setup registers three hooks with Codex CLI's own hook system in `~/.codex/hooks.json`, and records them as trusted so Codex runs them without a review step.",
    hooks: [
      {
        event: "Stop",
        what: "Codex finished its turn",
        how: "Titled `backend · Codex`, with the body `backend: Task complete`. anotifier doesn't read Codex's reply, so the text is the same every time; the project name tells you which run finished.",
      },
      {
        event: "PermissionRequest",
        what: "Codex is waiting for your approval",
        how: "`backend: Needs your input`, sent urgent with its own sound. The command isn't in the alert; you see it in the terminal. anotifier never answers the request, so Codex's own approval prompt decides.",
      },
      {
        event: "SessionStart",
        what: "A Codex session started",
        how: "Quiet by default: toast, phone push and bell are off for this event. A webhook, if you set one up, still receives `Session started`.",
      },
    ],
    sections: [
      {
        id: "setup",
        kicker: "[ WHAT SETUP WRITES ]",
        title: "Hooks in hooks.json, trust in config.toml.",
        blocks: [
          {
            kind: "p",
            text: "Setup wires Codex when a `~/.codex` folder exists. It backs up `hooks.json` to `~/.anotifier/backups/`, then adds one entry per event to `~/.codex/hooks.json`. This is the `Stop` one:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [
                  {
                    hooks: [
                      {
                        type: "command",
                        command: `node "${NOTIFY}" --source codex --event Stop`,
                        timeout: 10,
                        statusMessage: "Sending notification",
                      },
                    ],
                  },
                ],
              },
            }),
          },
          {
            kind: "p",
            text: "`PermissionRequest` and `SessionStart` get the same entry with their own `--event`. In `~/.codex/config.toml`, setup turns hooks on (renaming an older `codex_hooks = true`) and records a trust hash for each entry:",
          },
          {
            kind: "code",
            lang: "toml",
            code: "[features]\nhooks = true\n\n[hooks.state.'/home/you/.codex/hooks.json:stop:0:0']\ntrusted_hash = \"sha256:…\"",
          },
          {
            kind: "p",
            text: "Codex skips a new or edited hook until it is trusted, which is why setup writes the hashes. Edit an anotifier entry by hand and Codex skips it until you trust it again in `/hooks`, or rerun setup.",
          },
        ],
      },
      {
        id: "limits",
        kicker: "[ GOOD TO KNOW ]",
        title: "What it does, and what it doesn't.",
        blocks: [
          {
            kind: "ul",
            items: [
              "**Interactive sessions only.** Codex runs hooks in its TUI, not in `codex exec`, so scripted runs finish without an alert.",
              "**Codex waits for the hook.** Hooks run synchronously: Codex shows “Sending notification” until anotifier exits, at most 10 seconds. Every channel sends in parallel with a shorter timeout of its own.",
              "**Codex's built-in alerts still work.** Its `[tui] notifications` setting can ding or post a desktop notification too; the [Codex sound guide](/guides/codex-notification-sound/) shows how to tune them so you don't hear two dings.",
              "**The ding** is a bell anotifier writes to the terminal Codex runs in, or to its tmux pane; on Windows, to the console Codex runs in.",
              CLICK_TO_FOCUS,
              "**Uninstall** removes the three entries and their trust hashes, and leaves `[features] hooks = true` as it is.",
              "**Tested with Codex CLI 0.144.0 and later.**",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How does anotifier know when Codex CLI is done?",
        aHtml:
          "<p>Codex CLI has its own hook system. <code>anotifier setup</code> writes <code>Stop</code>, <code>PermissionRequest</code> and <code>SessionStart</code> hooks into <code>~/.codex/hooks.json</code>, turns hooks on in <code>~/.codex/config.toml</code>, and records a trust hash for each, so Codex runs them straight away.</p>",
      },
      {
        q: "Does the approval alert show the command?",
        aHtml:
          "<p>No. It says <code>my-app: Needs your input</code>, sent urgent with its own sound. The command itself is in the Codex terminal, where you approve it.</p>",
      },
      {
        q: "Can I approve a Codex request from the notification?",
        aHtml:
          "<p>No. anotifier only tells you that Codex is waiting. It never answers the <code>PermissionRequest</code>, so Codex's normal approval prompt decides.</p>",
      },
      {
        q: "Does it slow Codex down?",
        aHtml:
          "<p>Codex waits for each hook to finish, showing “Sending notification”, for at most 10 seconds. anotifier sends to every channel in parallel with shorter timeouts of its own and always exits cleanly, so a dead channel can't stall a run.</p>",
      },
      {
        q: "Why is there no alert when I use codex exec?",
        aHtml:
          "<p>Codex runs hooks in the interactive TUI only, so <code>codex exec</code> runs finish without one.</p>",
      },
    ],
    icon: "/assets/icons/codex.png",
  },
  {
    slug: "cursor",
    updated: "2026-10-09",
    name: "Cursor",
    title: "Cursor Agent Notifier — Desktop, Phone & Slack Alerts",
    description:
      "anotifier is a free Cursor agent notifier: a desktop toast, phone push, or webhook when the agent run ends. One-command setup, no extension needed.",
    h1: { pre: "anotifier for ", em: "Cursor", post: "." },
    sub: "You kick off a Cursor agent, switch to something else, and check back… too late or too often. anotifier hooks Cursor's agent lifecycle and tells you the moment the run is over.",
    hooksIntro:
      "Setup adds one hook to Cursor's own hook file, `~/.cursor/hooks.json`, so the alert fires when the agent stops, not when you happen to look.",
    hooks: [
      {
        event: "stop",
        what: "The Cursor agent run ended",
        how: "A toast titled `Cursor` that says `Task complete`, or the same words by phone push or webhook. anotifier doesn't read the project or the run's status from Cursor's event, so every Cursor alert looks the same, however the run ended.",
      },
    ],
    sections: [
      {
        id: "setup",
        kicker: "[ WHAT SETUP WRITES ]",
        title: "One stop hook in ~/.cursor/hooks.json.",
        blocks: [
          {
            kind: "p",
            text: "Setup wires Cursor when a `~/.cursor` folder exists. It backs up `~/.cursor/hooks.json` to `~/.anotifier/backups/`, then writes one entry in Cursor's hook format:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              version: 1,
              hooks: {
                stop: [
                  { command: `node "${NOTIFY}" --source cursor --event stop` },
                ],
              },
            }),
          },
          {
            kind: "p",
            text: "Your other Cursor hooks stay as they are. Cursor can fire `stop` twice for one run; anotifier drops a repeat of the same event from the same session within 1.5 seconds, so you get one alert.",
          },
        ],
      },
      {
        id: "limits",
        kicker: "[ GOOD TO KNOW ]",
        title: "What it does, and what it doesn't.",
        blocks: [
          {
            kind: "ul",
            items: [
              "**Finished runs only.** anotifier registers `stop`, so it tells you a run is over, not that the agent is waiting on you.",
              "**No project name, so no click-to-focus.** Click-to-focus (Windows only) finds the window by the project folder, and Cursor alerts don't carry one.",
              "**Usually no bell.** The bell rings in the terminal the agent runs in, and the Cursor editor normally has none.",
              "**Cursor's editor agent.** The README lists the Cursor CLI as unsupported.",
              "**How it's tested.** CI checks that setup writes and removes the Cursor hook correctly. Unlike Claude Code, Codex and Gemini CLI, a real Cursor run isn't driven end to end.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does this need a Cursor extension?",
        aHtml:
          "<p>No. anotifier hooks Cursor's own agent hook system from the outside — <code>anotifier setup</code> detects Cursor and wires it up automatically.</p>",
      },
      {
        q: "What does a Cursor notification look like?",
        aHtml:
          "<p>A toast titled <code>Cursor</code> with the text <code>Task complete</code>, or the same words by phone push or webhook. It doesn't name the project or list the edited files.</p>",
      },
      {
        q: "Will I get an alert when the Cursor agent needs approval?",
        aHtml:
          '<p>No. anotifier only hooks the <code>stop</code> event, so you hear about finished runs. The <a href="/guides/cursor-agent-notifications/">Cursor notifications guide</a> covers the other options.</p>',
      },
      {
        q: "Can I use it alongside Claude Code and Codex?",
        aHtml:
          "<p>Yes — that's the point. One config covers every agent anotifier supports, so all your tools notify through the same channels.</p>",
      },
    ],
    icon: "/assets/icons/cursor.png",
  },
  {
    slug: "gemini-cli",
    updated: "2026-10-09",
    name: "Gemini CLI",
    title: "Gemini CLI Notifier — Desktop, Phone & Webhook Alerts",
    description:
      "anotifier is a free Gemini CLI notifier: it hooks Gemini's agent events and sends a desktop, phone, or webhook alert when a run finishes or needs input.",
    h1: { pre: "anotifier for ", em: "Gemini CLI", post: "." },
    sub: "Gemini CLI chews through long agentic runs in your terminal. anotifier hooks its agent events so the finish line — or a prompt that blocks it — reaches you wherever you are.",
    notice:
      "**Gemini CLI or Antigravity CLI?** On June 18, 2026 Google stopped serving Gemini CLI to Google AI Pro and Ultra subscribers and free Gemini Code Assist users, and moved them to Antigravity CLI. Gemini CLI still runs with a Gemini API key or a Code Assist Standard or Enterprise license, and that is what anotifier hooks. [anotifier 1.4.0 and later also support Antigravity CLI](#antigravity).",
    hooksIntro:
      "Setup registers two hooks in Gemini CLI's settings file, `~/.gemini/settings.json`, so the alerts come from Gemini itself, not from polling.",
    hooks: [
      {
        event: "AfterAgent",
        what: "The agent loop finished",
        how: "Titled `frontend · Gemini`, with the body `frontend: Task complete`. anotifier doesn't read Gemini's reply, so the text is the same every time.",
      },
      {
        event: "Notification",
        what: "Gemini CLI raised a notification",
        how: "`frontend: Needs your input`, sent urgent. Every notification Gemini CLI sends, such as a tool approval prompt, becomes this alert; anotifier doesn't filter by type.",
      },
    ],
    sections: [
      {
        id: "setup",
        kicker: "[ WHAT SETUP WRITES ]",
        title: "Two hooks in ~/.gemini/settings.json.",
        blocks: [
          {
            kind: "p",
            text: "Setup wires Gemini CLI when a `~/.gemini` folder exists. It backs up `settings.json` to `~/.anotifier/backups/` and adds one entry per event. Gemini CLI takes the timeout in milliseconds:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                AfterAgent: [
                  {
                    hooks: [
                      {
                        type: "command",
                        command: `node "${NOTIFY}" --source gemini`,
                        timeout: 30000,
                      },
                    ],
                    _managed_by: "anotifier",
                  },
                ],
              },
            }),
          },
          {
            kind: "p",
            text: "`Notification` gets an identical entry. Older anotifier versions wrote a separate `~/.gemini/hooks.json`; setup removes those stale entries, because Gemini CLI reads hooks from `settings.json`.",
          },
        ],
      },
      {
        id: "antigravity",
        kicker: "[ ANTIGRAVITY CLI ]",
        title: "Moved to Antigravity CLI? Supported from 1.4.0.",
        blocks: [
          {
            kind: "p",
            text: "Antigravity CLI keeps hooks, in a new format. It reads them from its own files, such as `~/.gemini/config/hooks.json` or a workspace's `.agents/hooks.json`, and its events are `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`. There is no `AfterAgent` or `Notification` event, so the hooks anotifier writes for Gemini CLI don't fire there. anotifier 1.4.0 and later wire Antigravity CLI separately: run `npx anotifier setup` and, when `~/.gemini/antigravity-cli` exists, it adds one group named `anotifier` with a `Stop` handler to `~/.gemini/config/hooks.json`, beside any groups of your own, after backing up an existing file. A finished run sends \"Task complete\", titled `<project> · Antigravity`. Google's [Antigravity hooks docs](https://antigravity.google/docs/hooks/) describe the format.",
          },
          {
            kind: "p",
            text: "Limits: Antigravity has no notification or permission event, so there is no needs-input alert for it, and a `Stop` caused by an error or a cancel also says \"Task complete\". Google's docs say the Antigravity 2.0 app and the Antigravity IDE read the same global `~/.gemini/config/hooks.json`, so a handler setup wrote should fire there too, but setup only wires Antigravity when `~/.gemini/antigravity-cli` exists and neither app has been tested. Hook wiring and payload parsing are unit-tested against Google's hooks docs; anotifier has not yet been tested against a live Antigravity CLI.",
          },
          {
            kind: "p",
            text: "The full Antigravity CLI setup, limits and FAQ are on the [Antigravity CLI page](/antigravity-cli/), and the [Antigravity CLI notifications guide](/guides/antigravity-cli-notifications/) covers writing the hook yourself. The Gemini CLI entries stay in `~/.gemini/settings.json` until you remove them with `npx anotifier@latest uninstall`, which removes only the handlers anotifier added to the Antigravity file.",
          },
        ],
      },
      {
        id: "limits",
        kicker: "[ GOOD TO KNOW ]",
        title: "What it does, and what it doesn't.",
        blocks: [
          {
            kind: "ul",
            items: [
              "**Tested end to end.** CI installs Gemini CLI 0.50.0, runs a prompt with an API key, and fails unless the `AfterAgent` hook delivers a real ntfy push.",
              "**The ding** is a bell anotifier writes to the terminal Gemini CLI runs in, when it has one.",
              CLICK_TO_FOCUS,
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How does the Gemini CLI integration work?",
        aHtml:
          "<p>Gemini CLI supports lifecycle hooks in <code>~/.gemini/settings.json</code>. <code>anotifier setup</code> registers <code>AfterAgent</code> (the run finished) and <code>Notification</code> (Gemini needs attention) there, after backing the file up, and routes both to your channels.</p>",
      },
      {
        q: "Does anotifier work with Antigravity CLI?",
        aHtml:
          "<p>Yes, from anotifier 1.4.0. Antigravity CLI has no <code>AfterAgent</code> or <code>Notification</code> event, so the Gemini CLI hooks don't fire there; instead <code>npx anotifier setup</code> adds an <code>anotifier</code> group with a <code>Stop</code> handler to <code>~/.gemini/config/hooks.json</code> when <code>~/.gemini/antigravity-cli</code> exists. You get a &quot;Task complete&quot; alert. There is no needs-input alert, a stop caused by an error or cancel also says &quot;Task complete&quot;, and it has not yet been tested against a live Antigravity CLI.</p>",
      },
      {
        q: "Can I still use Gemini CLI?",
        aHtml:
          "<p>With a Gemini API key or a Gemini Code Assist Standard or Enterprise license, yes; anotifier's CI still runs Gemini CLI with an API key. Google stopped serving it to Google AI Pro and Ultra subscribers and free Code Assist users on June 18, 2026, and points them to Antigravity CLI.</p>",
      },
      {
        q: "Does the notification include what Gemini said?",
        aHtml:
          "<p>No. The body is <code>my-app: Task complete</code> or <code>my-app: Needs your input</code>, with the project in the title. Only Claude Code alerts carry the agent's own words.</p>",
      },
      {
        q: "Which platforms can receive the alerts?",
        aHtml:
          '<p>macOS, Windows, and Linux/WSL desktop toasts, Android and iOS push via <a href="https://ntfy.sh">ntfy</a>, plus webhooks for Slack, Discord, Telegram, or any HTTP endpoint.</p>',
      },
    ],
    icon: "/assets/icons/gemini.png",
  },
  {
    slug: "antigravity-cli",
    updated: "2026-10-09",
    name: "Antigravity CLI",
    title: "Antigravity CLI Notifier — Desktop, Phone & Webhook Alerts",
    description:
      "anotifier is a free Antigravity CLI notifier: a Stop hook in ~/.gemini/config/hooks.json sends a desktop, phone, or webhook alert when a run finishes.",
    h1: { pre: "anotifier for ", em: "Antigravity CLI", post: "." },
    sub: "Antigravity CLI runs long agent sessions in your terminal. anotifier adds a Stop hook to its hooks file, so a desktop toast, phone push or webhook tells you the moment a run ends.",
    notice:
      "**Supported from anotifier 1.4.0.** Hook wiring and payload parsing are unit-tested against [Google's hooks docs](https://antigravity.google/docs/hooks/). anotifier has not yet been tested against a live Antigravity CLI.",
    hooksIntro:
      "Setup adds one group named `anotifier` to Antigravity's global hooks file, `~/.gemini/config/hooks.json`. Antigravity runs the handler itself when the event fires, so there is no extension and no wrapper process.",
    hooks: [
      {
        event: "Stop",
        what: "A run ended",
        how: 'Titled `my-app · Antigravity`, with the body `my-app: Task complete`. The project name is the name of the first folder listed in `workspacePaths`. The hook always answers `{"decision":"stop"}`, so it can never keep the agent running.',
      },
    ],
    sections: [
      {
        id: "setup",
        kicker: "[ WHAT SETUP WRITES ]",
        title: "One group in ~/.gemini/config/hooks.json.",
        blocks: [
          {
            kind: "p",
            text: "Setup wires Antigravity CLI only when a `~/.gemini/antigravity-cli` folder exists. If `hooks.json` already exists, setup copies it to `~/.anotifier/backups/`, then adds a top-level group named `anotifier` beside any groups of your own. The `Stop` handler takes its timeout in seconds, and the payload names no event, so setup passes `--event Stop`:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              anotifier: {
                Stop: [
                  {
                    type: "command",
                    command: `node "${NOTIFY}" --source antigravity --event Stop`,
                    timeout: 30,
                  },
                ],
              },
            }),
          },
          {
            kind: "p",
            text: 'Run setup again after an update and it keeps a group you muted with `"enabled": false` and a timeout you changed on the handler. Google\'s docs say the Antigravity 2.0 app and the Antigravity IDE read the same global `~/.gemini/config/hooks.json`, so a handler setup wrote should fire there too. But setup only wires Antigravity when `~/.gemini/antigravity-cli` exists, and neither app has been tested.',
          },
        ],
      },
      {
        id: "limits",
        kicker: "[ GOOD TO KNOW ]",
        title: "What it does, and what it doesn't.",
        blocks: [
          {
            kind: "ul",
            items: [
              "**One alert type: finished.** Antigravity has no notification or permission event. Its events are `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`, so there is no needs-input alert for it.",
              '**A failed or cancelled run also says "Task complete".** anotifier does not read `terminationReason`, whose values are not fully documented, or `fullyIdle`, so every `Stop` alerts.',
              "**The text is generic.** anotifier does not read the transcript for Antigravity, so the alert never quotes what the agent said.",
              "**Gemini CLI hooks don't apply.** Antigravity has no `AfterAgent` or `Notification` event. If you also use Gemini CLI, see the [Gemini CLI page](/gemini-cli/).",
              "**Not tested against a live Antigravity CLI yet.** The unit tests follow Google's hooks docs; there is no live Antigravity lane in CI.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does anotifier work with Antigravity CLI?",
        aHtml:
          "<p>Yes, from anotifier 1.4.0. <code>npx anotifier setup</code> adds a <code>Stop</code> handler to <code>~/.gemini/config/hooks.json</code> and you get a &ldquo;Task complete&rdquo; alert on your desktop, phone or webhook when a run ends. The hook wiring and payload parsing are unit-tested against Google&rsquo;s hooks docs; anotifier has not yet been tested against a live Antigravity CLI.</p>",
      },
      {
        q: "When does setup wire Antigravity CLI?",
        aHtml:
          "<p>When a <code>~/.gemini/antigravity-cli</code> folder exists. Gemini CLI is detected separately, so a machine with both gets both sets of hooks.</p>",
      },
      {
        q: "Will I be told when Antigravity CLI is waiting for permission?",
        aHtml:
          "<p>No. Antigravity has no notification or permission event, so there is nothing for anotifier to hook. It reports finished runs only.</p>",
      },
      {
        q: 'Why does a failed or cancelled run say "Task complete"?',
        aHtml:
          "<p>anotifier does not read <code>terminationReason</code> or <code>fullyIdle</code> from the <code>Stop</code> payload, so every stop alerts and the text is the same. A missed alert costs more than an early one.</p>",
      },
      {
        q: "Does it work in the Antigravity 2.0 app and the IDE?",
        aHtml:
          "<p>Yes. Both read the same global <code>~/.gemini/config/hooks.json</code>, so the handler fires when they finish too.</p>",
      },
      {
        q: "Can the hook keep Antigravity from stopping?",
        aHtml:
          "<p>No. A <code>Stop</code> hook that answers <code>continue</code> sends the agent back into its loop. anotifier always answers <code>{&quot;decision&quot;:&quot;stop&quot;}</code>, even when a channel fails or the run is silenced, so it can never keep a run going.</p>",
      },
      {
        q: "How do I remove it?",
        aHtml:
          "<p>Run <code>npx anotifier@latest uninstall</code>. It removes only the handlers anotifier added to <code>hooks.json</code>; your own groups stay.</p>",
      },
    ],
    icon: "/assets/icons/gemini.png",
  },
  {
    slug: "vscode",
    updated: "2026-10-15",
    name: "VS Code",
    title: "VS Code AI Agent Notifier — Claude Code & Cursor Alerts",
    description:
      "Running Claude Code or another AI agent inside VS Code? anotifier alerts you when it finishes or needs input, by desktop toast, phone push, or webhook.",
    h1: { pre: "Agent notifications, in ", em: "VS Code", post: "." },
    sub: "Agents running inside your editor are the easiest to forget — the terminal panel is hidden and the agent works in silence. anotifier surfaces every finish and every question as a real notification, and on Windows a click on the toast brings the project's window forward.",
    hooksIntro:
      "anotifier's hooks fire no matter where the agent runs: a standalone terminal, the VS Code integrated terminal, or an editor's agent panel.",
    hooks: [
      {
        event: "Claude Code in VS Code",
        what: "Stop & Notification hooks",
        how: "The same hooks fire in the VS Code extension and in the integrated terminal.",
      },
      {
        event: "Cursor",
        what: "Agent stop hook",
        how: "Cursor is a VS Code fork with its own hook file. Its alert is titled `Cursor` and says `Task complete`.",
      },
      {
        event: "Codex CLI · Gemini CLI",
        what: "Their own hooks",
        how: "Run either in the integrated terminal and its hooks fire as they do anywhere else.",
      },
    ],
    sections: [
      {
        id: "setup",
        kicker: "[ WHAT SETUP WRITES ]",
        title: "No extension: setup edits each agent's own hook file.",
        blocks: [
          {
            kind: "p",
            text: "VS Code never sees anotifier. `npx anotifier@latest setup` looks in your home folder for the agents you have installed and adds an anotifier entry to the hook file each one already reads. Nothing is installed into VS Code and nothing is added to its settings.",
          },
          {
            kind: "table",
            head: ["Agent", "Setup wires it when", "File it edits", "Events"],
            rows: [
              [
                "Claude Code",
                "`~/.claude/settings.json` exists",
                "`~/.claude/settings.json`",
                "`Stop`, `Notification`",
              ],
              [
                "Cursor",
                "`~/.cursor` exists",
                "`~/.cursor/hooks.json`",
                "`stop`",
              ],
              [
                "Codex CLI",
                "`~/.codex` exists",
                "`~/.codex/hooks.json`, plus trust in `config.toml`",
                "`Stop`, `PermissionRequest`, `SessionStart`",
              ],
              [
                "Gemini CLI",
                "`~/.gemini` exists and isn't only Antigravity's",
                "`~/.gemini/settings.json`",
                "`AfterAgent`, `Notification`",
              ],
            ],
          },
          {
            kind: "p",
            text: "Open each agent once before you run setup, so its folder exists. Setup copies every file it changes to `~/.anotifier/backups/` first, and `npx anotifier@latest uninstall` removes only the entries it added.",
          },
        ],
      },
      {
        id: "alerts",
        kicker: "[ WHAT YOU GET ]",
        title: "What each alert says.",
        blocks: [
          {
            kind: "p",
            text: "The title is the project and the agent, such as `my-app · Claude Code`. The project is the name of the folder the agent was started in, so two VS Code windows on different folders read differently at a glance. For Claude Code the body is the start of Claude's last reply, up to 180 characters, or its own message when it needs you; phone push says `my-app: Task complete` instead. Codex CLI and Gemini CLI send `my-app: Task complete` or `my-app: Needs your input`. Cursor sends no project folder, so its alert is just `Cursor` and `Task complete`.",
          },
          {
            kind: "p",
            text: "Every alert goes to each channel you have on: the desktop toast, [phone push](/phone/) through ntfy, a [Slack](/slack/), [Discord](/discord/) or [Telegram](/telegram/) webhook, and the terminal bell. Only Claude Code can quote its reply; the other agents always send the generic line.",
          },
        ],
      },
      {
        id: "focus",
        kicker: "[ CLICK TO FOCUS ]",
        title: "On Windows, a click brings the right window forward.",
        blocks: [
          {
            kind: "p",
            text: "The first Windows toast registers an `agentfocus://` link handler in your user registry hive, and each toast carries one. A click opens it and a small script looks for a window to raise, in this order:",
          },
          {
            kind: "ol",
            items: [
              "A terminal window whose title contains the project folder name: Windows Terminal, PowerShell, cmd, Warp, WezTerm, Alacritty, Hyper, ConEmu or tmux.",
              "A window titled `Visual Studio Code` that contains the folder name. VS Code puts the open folder in its window title, which is why this works.",
              "A window titled `Cursor` that contains the folder name.",
              "Any other window whose title contains the folder name.",
              "If none match, the nearest window owned by a parent process of the hook, looked up when the toast fired.",
            ],
          },
          {
            kind: "p",
            text: "Cursor alerts carry no folder, so their toasts have no click action at all, and neither do macOS, Linux and WSL toasts. To turn it off on Windows, set `toast.clickToFocus` to `false` in `~/.anotifier/config.json`.",
          },
        ],
      },
      {
        id: "troubleshooting",
        kicker: "[ IF NOTHING ARRIVES ]",
        title: "Checks when an agent in VS Code stays quiet.",
        blocks: [
          {
            kind: "table",
            head: ["What you see", "Likely cause", "What to do"],
            rows: [
              [
                "No alert from any agent",
                "The agent's folder didn't exist when setup ran, so its hooks were never written.",
                "Run `npx anotifier@latest status`. It lists each tool as wired or not installed. Start the agent once, then run setup again.",
              ],
              [
                "`test` works but the agent is silent",
                "The hook is running into an error.",
                "`status` prints recent hook errors from `~/.anotifier/errors.log`.",
              ],
              [
                "No toast on Windows",
                "Toasts need PowerShell 7 (`pwsh`) and the BurntToast module.",
                "Setup checks both. If `pwsh` is missing, run `winget install --id Microsoft.PowerShell --source winget`, then setup again.",
              ],
              [
                "Clicking the toast does nothing useful",
                "No window title contains the project folder, or the alert is from Cursor, macOS, Linux or WSL.",
                "Open the folder itself in VS Code so its name appears in the title. See the order above.",
              ],
            ],
          },
          {
            kind: "p",
            text: "The [notifications not working guide](/guides/notifications-not-working/) walks through every channel in the same way.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Do I need to install a VS Code extension?",
        aHtml:
          "<p>No. anotifier hooks the agents themselves, so it works regardless of which editor hosts them — nothing is added to VS Code.</p>",
      },
      {
        q: "What is click-to-focus?",
        aHtml:
          "<p>On Windows, clicking a toast brings forward the window whose title contains the project folder, preferring a terminal, then VS Code, then Cursor. Cursor alerts carry no project folder, so they can't do it, and macOS, Linux and WSL toasts have no click action.</p>",
      },
      {
        q: "Which agents does it cover inside VS Code?",
        aHtml:
          "<p>Claude Code in the VS Code extension or the integrated terminal, Cursor's agent, and Codex CLI or Gemini CLI when you run them in the integrated terminal.</p>",
      },
      {
        q: "Will I hear the terminal bell in VS Code?",
        aHtml:
          "<p>Not always. VS Code can swallow the terminal bell; run <code>anotifier doctor</code> in its terminal and it warns you about that. The toast and phone push don't depend on the bell.</p>",
      },
      {
        q: "How do I get a notification when Claude Code finishes in VS Code?",
        aHtml:
          "<p>Open Claude Code once, then run <code>npx anotifier@latest setup</code>. It adds <code>Stop</code> and <code>Notification</code> hooks to <code>~/.claude/settings.json</code>, and they fire for the VS Code extension and the integrated terminal alike. Run <code>npx anotifier@latest test</code> to see a sample alert.</p>",
      },
      {
        q: "Does it work with GitHub Copilot's agent mode in VS Code?",
        aHtml:
          "<p>No. anotifier only registers hooks for Claude Code, Codex CLI, Cursor, Gemini CLI and Antigravity CLI. It writes nothing for Copilot, so Copilot's agent finishes without an alert.</p>",
      },
      {
        q: "Does it work over Remote-SSH, WSL or a dev container?",
        aHtml:
          '<p>The hook runs on the machine where the agent runs. When anotifier runs inside WSL, toasts go out through Windows PowerShell; the <a href="/guides/windows-wsl-notifications/">Windows and WSL guide</a> covers the setup. Over Remote-SSH or in a dev container the toast would appear on the remote machine, so use <a href="/phone/">phone push</a> or a <a href="/discord/">Discord</a> or Slack webhook there.</p>',
      },
    ],
    icon: "/assets/icons/vscode.png",
  },
];

export function getAgent(slug: string): Agent | undefined {
  return AGENTS.find((a) => a.slug === slug);
}
