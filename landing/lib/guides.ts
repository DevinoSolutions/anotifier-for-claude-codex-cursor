import type { Block, DocFaq } from "./docs";
import { CLAUDE_GUIDES, json } from "./claude-guides";
import { ANTIGRAVITY_GUIDES } from "./antigravity-guides";
import { CODEX_GUIDES } from "./codex-guides";
import { TOPIC_GUIDES } from "./topic-guides";
import { WSL_GUIDES } from "./wsl-guides";

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

// The WinRT toast call from lib/wsl-guides.ts (anotifier's own WSL toast,
// assets/windows/toast-wsl.ps1): no module, runs on Windows PowerShell 5.1.
const CODEX_WIN_TOAST_PS1 = `param(
  [string]$Title = 'Codex',
  [string]$Message = 'Done'
)
$ErrorActionPreference = 'Stop'
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $xml.GetElementsByTagName('text')
$null = $texts.Item(0).AppendChild($xml.CreateTextNode($Title))
$null = $texts.Item(1).AppendChild($xml.CreateTextNode($Message))
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)`;

const codexWindowsToast = (message: string) =>
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\\.codex\\win-toast.ps1" -Title Codex -Message "${message}"`;

const CODEX_WIN_HOOKS = json({
  hooks: {
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: 'notify-send "Codex" "Turn complete"',
            commandWindows: codexWindowsToast("Turn complete"),
            async: true,
          },
        ],
      },
    ],
    PermissionRequest: [
      {
        hooks: [
          {
            type: "command",
            command: 'notify-send -u critical "Codex" "Needs approval"',
            commandWindows: codexWindowsToast("Needs approval"),
            async: true,
          },
        ],
      },
    ],
  },
});

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
        "[Slack](/slack/) / [Discord](/discord/) / [Telegram](/telegram/)",
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

/** anotifier reads no project folder from Cursor's stop event and hooks only
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

const cursorStopHook = (command: string) =>
  json({ version: 1, hooks: { stop: [{ command }] } });

const CURSOR_HOOK_SCRIPT = cursorStopHook("./hooks/notify.sh");
const CURSOR_HOOK_LINUX = cursorStopHook(
  'notify-send "Cursor" "Agent finished"',
);
const CURSOR_HOOK_MAC = cursorStopHook(
  `osascript -e 'display notification "Agent finished" with title "Cursor"'`,
);
const CURSOR_HOOK_WINDOWS = cursorStopHook(
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/Users/you/.cursor/win-toast.ps1" -Title Cursor -Message "Agent finished"',
);
const CURSOR_HOOK_NTFY = cursorStopHook(
  'curl -s -d "Cursor agent finished" ntfy.sh/your-secret-topic',
);
const CURSOR_SLACK_CONFIG = json({
  webhook: {
    enabled: true,
    url: "https://hooks.slack.com/services/...",
    format: "slack",
  },
});
const CURSOR_NOTIFY_SH = `#!/bin/bash
input=$(cat)
status=$(echo "$input" | jq -r '.status')
project=$(basename "$(echo "$input" | jq -r '.workspace_roots[0]')")
notify-send "Cursor · $project" "Agent $status"`;

const AGENT_GUIDES: Guide[] = [
  {
    slug: "claude-code-notifications",
    updated: "2026-10-15",
    kind: "agent",
    agentSlug: "claude-code",
    name: "Claude Code",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Notification When It Finishes: Desktop & Phone",
    description:
      "Add a Stop hook for finished turns and a Notification hook for input prompts to ~/.claude/settings.json. Configs for a macOS banner, the bell and ntfy push.",
    h1: "How to get notified when Claude Code finishes or needs you",
    intro:
      "Add two hooks to `~/.claude/settings.json`: `Stop`, which fires when Claude finishes a turn, and `Notification`, which fires when it needs your permission or input. Point each at a command that shows a banner, plays a sound (see the [Claude Code notification sound guide](/guides/claude-code-notification-sound/)), or sends a push to your phone. Or run `npx anotifier@latest setup`, the [Claude Code notifier](/claude-code/), which wires both for you. Below is every option, from the one-line setting to a full multi-agent setup, with configs you can paste.",
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
            text: "What you get: a beep or a plain banner on the machine you are sitting at, with no project name, no message content, and nothing on your phone. Terminals without the built-in notification, such as Warp or the VS Code integrated terminal, need the bell or a hook. For the bell, custom sounds, and turning them off, see the [Claude Code notification sound guide](/guides/claude-code-notification-sound/); for what the hooks do inside the editor, see [anotifier in VS Code](/vscode/).",
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
          {
            kind: "p",
            text: "Searching for ccnotify? Several unrelated Claude Code tools share that name, and none of them is anotifier. [ccnotify: which one is which](/guides/ccnotify/) tells them apart and compares each with anotifier.",
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
    updated: "2026-10-15",
    kind: "agent",
    agentSlug: "codex",
    name: "Codex CLI",
    icon: "/assets/icons/codex.png",
    title: "Codex CLI Notifications on Windows, macOS & Linux",
    description:
      "Codex CLI alerts only in the background; in Windows Terminal that is a bell. Add desktop or phone alerts with hooks or anotifier, or turn them off.",
    h1: "How to get notified when Codex CLI finishes or needs approval",
    intro:
      "Codex CLI already notifies you when a turn ends or an approval is waiting, but by default only while its terminal is in the background: a desktop notification in Ghostty, iTerm2, Kitty, Warp and WezTerm, and the terminal bell everywhere else, including Windows Terminal and VS Code. For alerts you can't miss, add `Stop` and `PermissionRequest` hooks to `~/.codex/hooks.json`, or run `npx anotifier@latest setup` to send both to your desktop and phone. Here is every option, then [Codex on Windows](#windows) and [how to turn the alerts off](#mute). To make Codex ding when it needs a response, see [Codex CLI notification sounds](/guides/codex-notification-sound/).",
    sections: [
      {
        id: "builtin",
        title: "Option 1: Codex's built-in TUI notifications",
        blocks: [
          {
            kind: "p",
            text: "The Codex TUI notifies you out of the box when a turn ends, when it asks to run a command or edit files, and when a Plan mode prompt or a question is waiting. In Ghostty, iTerm2, Kitty, Warp, and WezTerm it sends an OSC 9 desktop notification; in any other terminal, including Windows Terminal and the VS Code terminal, it rings the bell. By default it does this only while the terminal is unfocused. Tune it under `[tui]` in `~/.codex/config.toml`:",
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
            text: "The wizard detects `~/.codex`, writes `Stop`, `PermissionRequest`, and `SessionStart` hooks into `~/.codex/hooks.json`, enables the hooks feature flag, records the trust hashes in `config.toml`, and backs up `hooks.json` first. A finished turn arrives as `my-app · Codex` at default priority; an approval request arrives urgent, on your desktop and phone, so the run never sits blocked while you are in another window. The approval path is proven in CI by driving the real Codex TUI through a permission modal.",
          },
          ...WHAT_ANOTIFIER_ADDS,
        ],
      },
      {
        id: "windows",
        title: "Codex CLI notifications on Windows",
        blocks: [
          {
            kind: "p",
            text: 'Codex CLI runs natively on Windows and keeps its settings in `%USERPROFILE%\\.codex`: `CODEX_HOME` defaults to `~/.codex`. The built-in notification works as described in Option 1, with one catch. With `notification_method = "auto"`, Codex sends OSC 9 only to Ghostty, iTerm2, Kitty, Warp, and WezTerm. Windows Terminal and the VS Code terminal are not on that list, so Codex rings the bell (BEL) there and no desktop notification appears. That is Codex CLI 0.162.1, the latest release at the time of writing.',
          },
          {
            kind: "ul",
            items: [
              "**Windows Terminal** decides what the bell does. Its `bellStyle` setting accepts `audible` (the default), `window`, `taskbar`, `all`, and `none`. Microsoft documents `all` as a sound plus a flashing taskbar icon, and says that when the terminal is not in focus only the taskbar icon flashes. Codex notifies only while the window is unfocused by default, so check what your `bellStyle` does in the background.",
              "**The VS Code terminal** handles the bell through its `accessibility.signals.terminalBell` setting. If you hear nothing, check that setting.",
            ],
          },
          {
            kind: "p",
            text: "To change it for every profile, set `bellStyle` under `profiles.defaults` in Windows Terminal's `settings.json`:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "profiles": {\n    "defaults": { "bellStyle": "all" }\n  }\n}',
          },
          {
            kind: "p",
            text: "For a real Windows notification, use a hook. Codex hooks accept `commandWindows`, an optional Windows-only replacement for `command`, and by default Codex starts a hook through `cmd.exe /C`. This version needs no module install. It reuses the Windows PowerShell 5.1 toast from the [WSL toast guide](/guides/wsl-notify-send/). Save it as `%USERPROFILE%\\.codex\\win-toast.ps1`:",
          },
          { kind: "code", lang: "powershell", code: CODEX_WIN_TOAST_PS1 },
          {
            kind: "p",
            text: "Then add this to `%USERPROFILE%\\.codex\\hooks.json`. The `command` entries are the Linux fallback and `commandWindows` runs on Windows; delete either one you don't need:",
          },
          { kind: "code", lang: "json", code: CODEX_WIN_HOOKS },
          {
            kind: "ul",
            items: [
              "Open `/hooks` in Codex and trust the two new hooks, or Codex skips them.",
              "The toast shows under the name Windows PowerShell, with the title and message you pass and no agent icon, custom sound, or click-to-focus. If nothing appears, Do not disturb (Focus Assist) may be on.",
              "For a sound file instead of a toast, use the `commandWindows` sound hook in the [Codex notification sound guide](/guides/codex-notification-sound/#hook).",
            ],
          },
          {
            kind: "p",
            text: "To skip the wiring, run `npx anotifier@latest setup` in PowerShell. On Windows it writes `Stop`, `PermissionRequest`, and `SessionStart` hooks into `%USERPROFILE%\\.codex\\hooks.json`, turns on the hooks feature flag, records the trust hashes in `config.toml`, and backs up `hooks.json` first. It then checks for PowerShell 7 (`pwsh`) and installs the BurntToast module for your user with `Install-Module BurntToast -Scope CurrentUser`; if `pwsh` is missing it prints `winget install --id Microsoft.PowerShell --source winget`. Toasts then arrive as `my-app · Codex` with the Codex icon and a Windows notification sound, and clicking one brings the terminal window forward. `anotifier test toast` confirms it works. The [Windows and WSL guide](/guides/windows-wsl-notifications/) has the details.",
          },
          {
            kind: "note",
            text: "anotifier looks for Codex in `.codex` under your home folder and does not read `CODEX_HOME`. If you set `CODEX_HOME` to another folder, add the hooks there by hand.",
          },
          {
            kind: "p",
            text: "Codex running inside WSL is the Linux build: it reads `~/.codex` in the distribution, so run `npx anotifier@latest setup` inside WSL. The toast then goes through Windows interop. See [Agent notifications on Windows and WSL](/guides/windows-wsl-notifications/) and [Windows toast from WSL](/guides/wsl-notify-send/).",
          },
        ],
      },
      {
        id: "mute",
        title: "Turn off or mute Codex CLI notifications",
        blocks: [
          {
            kind: "p",
            text: "Codex has several independent alerts, so pick the switch that matches the one you hear. To silence Codex's built-in notifications, put this in `~/.codex/config.toml`:",
          },
          {
            kind: "code",
            lang: "toml",
            code: "[tui]\nnotifications = false",
          },
          {
            kind: "table",
            head: ["To stop", "Do this"],
            rows: [
              [
                "All built-in TUI notifications",
                "`notifications = false` under `[tui]` in `~/.codex/config.toml`. The default is `true`, which allows every type",
              ],
              [
                "Only some of them",
                'List the types you want, such as `notifications = ["approval-requested"]`. The type names are in the [Codex notification sound guide](/guides/codex-notification-sound/#config)',
              ],
              [
                "Alerts while you are looking at Codex",
                'Leave `notification_condition` at its default, `"unfocused"`. `"always"` notifies even when the window is in front',
              ],
              [
                "The bell in Windows Terminal",
                'Set `bellStyle` to `"none"` in the profile (see the Windows section above)',
              ],
              [
                "The notify command",
                "Delete the `notify = [...]` line from `~/.codex/config.toml`",
              ],
              [
                "One hook",
                "Open `/hooks` in Codex and disable it, or delete its entry from `~/.codex/hooks.json`",
              ],
              [
                "anotifier for a while",
                "`anotifier snooze 2h` silences every channel until it expires; `anotifier snooze off` cancels it. Quiet hours (set `quietHours.enabled` to `true` in `~/.anotifier/config.json`; off by default) do the same every night",
              ],
              ["anotifier for good", "`npx anotifier@latest uninstall`"],
            ],
          },
          {
            kind: "note",
            text: "`uninstall` asks for confirmation, then removes anotifier's hooks from every agent it wired, not just Codex, after backing up each file. For Codex it also removes anotifier's trust entries from `config.toml`. It leaves your own hooks, the `hooks = true` line under `[features]`, and your settings in `~/.anotifier`. On Windows it also removes the click-to-focus registry entry; the BurntToast module stays installed. Snooze and quiet hours silence anotifier only; Codex's own `[tui]` alerts keep going until you change them.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does Codex CLI have built-in desktop notifications?",
        a: "Yes. The Codex TUI notifies when a turn ends and when an approval, Plan mode prompt, or question is waiting: an OSC 9 desktop notification in Ghostty, iTerm2, Kitty, Warp and WezTerm, the terminal bell elsewhere (including Windows Terminal and the VS Code terminal), and by default only while the terminal is unfocused. It doesn't reach your phone.",
      },
      {
        q: "How do I get Codex CLI notifications on Windows?",
        a: "In Windows Terminal, Codex's built-in alert is the terminal bell, because Codex only sends OSC 9 desktop notifications to Ghostty, iTerm2, Kitty, Warp and WezTerm. For a Windows toast, add Stop and PermissionRequest hooks with a commandWindows entry to %USERPROFILE%\\.codex\\hooks.json, or run npx anotifier@latest setup, which wires the hooks and installs the BurntToast module (it needs PowerShell 7).",
      },
      {
        q: "How do I turn off Codex CLI notifications?",
        a: "Set notifications = false under [tui] in ~/.codex/config.toml. That silences the built-in alerts only. To stop hook alerts, disable them with /hooks in Codex or remove them from hooks.json. To remove anotifier, run npx anotifier@latest uninstall; to pause it, run anotifier snooze 2h.",
      },
      {
        q: "How do I know when Codex is waiting for approval?",
        a: "Codex's built-in approval-requested notification covers it on your machine. For an alert on your phone (ntfy), in Telegram, or on every channel, use the PermissionRequest hook (Codex CLI 0.144+); anotifier registers it during setup and delivers it as an urgent notification on every channel you enabled.",
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
    updated: "2026-10-15",
    kind: "agent",
    agentSlug: "cursor",
    name: "Cursor",
    icon: "/assets/icons/cursor.png",
    title: "Cursor Notification When Done: Sound, Hooks & Phone Alerts",
    description:
      "Get a Cursor notification when the agent is done: the built-in sound and OS alert, a stop hook in hooks.json for a toast, phone push or Slack, and fixes.",
    h1: "How to get notified when the Cursor agent finishes",
    intro:
      "Cursor can play a sound and raise an OS notification when the agent finishes, but both only reach the computer running Cursor. For your own text, a phone push or a Slack message, add a `stop` hook to `~/.cursor/hooks.json`, which Cursor runs when the agent loop ends, or let `npx anotifier@latest setup` write it. This guide covers each option, the exact hook format, and what to check when nothing arrives.",
    sections: [
      {
        id: "built-in",
        title: "Cursor's built-in completion sound and notifications",
        blocks: [
          {
            kind: "p",
            text: "Cursor has two settings of its own, both in the app's Settings:",
          },
          {
            kind: "ul",
            items: [
              "**A sound.** Version 0.48 added a beta option to play a sound when a chat is ready for review. The [0.48 changelog](https://cursor.com/changelog/0-48-x) gave the path as Settings → Features → Chat → Play sound on finish. Cursor's settings have changed since, so if you don't find it there, search the settings for `sound`.",
              '**An OS notification.** The [1.5 changelog](https://cursor.com/changelog/1-5) says: "Get native OS notifications when an agent run finishes or when input is required." The example it gives is approving a command that is not allowlisted. It says to enable them from Settings, without naming the setting.',
            ],
          },
          {
            kind: "p",
            text: "Both happen on the computer running Cursor and use Cursor's fixed wording. Neither reaches your phone, Slack or a second machine, and you can't change the text, so for those you need a hook (next sections). They are still the cheapest answer to \"ding when it's done\": try them first.",
          },
          {
            kind: "p",
            text: "The Cursor CLI (`cursor-agent`) is separate. Its [CLI changelog](https://cursor.com/docs/cli/changelog) lists desktop notifications from April 2026 for a finished turn and for the agent being blocked on approvals, questions or sudo, in iTerm2, Ghostty, Warp, Kitty and Terminal.app. It doesn't say how to turn them on.",
          },
        ],
      },
      {
        id: "hook",
        title: "Cursor hooks by hand: the stop hook in hooks.json",
        blocks: [
          {
            kind: "p",
            text: "Cursor hooks run a command of yours at points in the agent loop. Put them in `~/.cursor/hooks.json` for every project (`%USERPROFILE%\\.cursor\\hooks.json` on Windows) or in `.cursor/hooks.json` inside one project. Cursor runs the matching hooks from every file and reloads the files when they change. This is the smallest working file:",
          },
          { kind: "code", lang: "json", code: CURSOR_HOOK_SCRIPT },
          {
            kind: "p",
            text: "What [Cursor's hooks docs](https://cursor.com/docs/hooks) say about it:",
          },
          {
            kind: "ul",
            items: [
              "`version` is `1`. Each key under `hooks` is an event name holding a list of entries. An entry needs `command`; `timeout` (seconds), `matcher` and `failClosed` are optional.",
              "`stop` fires when the agent loop ends. It gets JSON on stdin with `status` (`completed`, `aborted` or `error`) and `loop_count`, plus the fields every hook gets, among them `conversation_id`, `generation_id`, `hook_event_name` and `workspace_roots`.",
              "Exit code `0` means success, `2` blocks the action, and any other code is a failure that lets the agent carry on. A notification hook that fails therefore fails silently.",
              'A `stop` hook can print `{"followup_message": "..."}`, and Cursor sends that as the next message, up to `loop_limit` times (5 by default). A notification hook should print nothing.',
              "User hooks run with `~/.cursor/` as the working directory, so `./hooks/notify.sh` means `~/.cursor/hooks/notify.sh`. Project hooks run from the project root.",
              "To debug, open the Hooks tab under Customize or the Hooks output channel. If a new hook still doesn't load, restart Cursor.",
            ],
          },
          {
            kind: "p",
            text: "Cursor's documented events cover prompts, tool and shell calls, file edits, subagents and sessions, but none for \"waiting for your approval\". For that, Cursor's own OS notification above is the option.",
          },
        ],
      },
      {
        id: "hook-os",
        title: "A stop hook for macOS, Linux and Windows",
        blocks: [
          {
            kind: "p",
            text: "Each `hooks.json` below shows a banner with a fixed message and ignores the event JSON. **Linux** (needs `notify-send`, from libnotify):",
          },
          { kind: "code", lang: "json", code: CURSOR_HOOK_LINUX },
          { kind: "p", text: "**macOS:**" },
          { kind: "code", lang: "json", code: CURSOR_HOOK_MAC },
          {
            kind: "p",
            text: "**Windows.** Cursor's docs don't say which shell runs a hook command, so call PowerShell explicitly and use an absolute path with forward slashes. Save the toast script from the [Codex guide](/guides/codex-cli-notifications/#windows) (it takes a title and a message, and needs no module) as `C:/Users/you/.cursor/win-toast.ps1`, then:",
          },
          { kind: "code", lang: "json", code: CURSOR_HOOK_WINDOWS },
          {
            kind: "p",
            text: "To put the status and project name in the message, read the event JSON in a script. This one needs `jq`; save it as `~/.cursor/hooks/notify.sh`, run `chmod +x` on it, and point the hook's `command` at `./hooks/notify.sh` as in the first example:",
          },
          { kind: "code", lang: "bash", code: CURSOR_NOTIFY_SH },
          {
            kind: "p",
            text: 'On macOS swap the last line for `osascript -e "display notification \\"Agent $status\\" with title \\"Cursor · $project\\""`. `workspace_roots` is the list of folders open in the window, so `[0]` is the first. Test it before trusting it: `echo \'{"status":"completed","loop_count":0,"workspace_roots":["/home/you/my-app"]}\' | ~/.cursor/hooks/notify.sh`.',
          },
        ],
      },
      {
        id: "anotifier",
        title: "anotifier setup for Cursor",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "Setup wires Cursor when a `~/.cursor` folder exists. It copies `hooks.json` to `~/.anotifier/backups/`, sets `version` to `1`, and adds one entry under `stop` that runs anotifier's `notify.mjs` with `--source cursor --event stop`. Your other hooks stay; running setup again replaces anotifier's own entry instead of adding a second. Cursor reloads the file by itself.",
          },
          {
            kind: "p",
            text: "What you get, and what you don't:",
          },
          {
            kind: "ul",
            items: [
              "**One alert per finished run,** titled `Cursor` and saying `Task complete`, as a toast, a phone push and a webhook message (whichever you enabled). A second `stop` within 1.5 seconds is dropped, because Cursor has been seen firing the hook twice.",
              "**No project name.** Cursor's docs list `workspace_roots` in the hook input, but anotifier reads `cwd` and `workspacePaths` and not `workspace_roots`, so every Cursor alert looks the same. With several windows open, the hand-written script above is the way to name the project.",
              "**No status.** anotifier doesn't read `status`, so a run you stopped or one that ended in an error says `Task complete` too.",
              "**No click-to-focus.** The Windows toast jumps to a window by project folder, and a Cursor alert has none, so there is no click action.",
              '**Only `stop`.** There is no alert for "waiting for approval". Leave Cursor\'s own OS notification on for that.',
              "**Not driven by a live Cursor.** CI checks that setup writes and removes the hook correctly; it doesn't run a real Cursor agent end to end.",
            ],
          },
          ...WHAT_ANOTIFIER_ADDS_CURSOR,
          {
            kind: "p",
            text: "More on the [Cursor page](/cursor/), and what setup writes for every agent in [Agent hooks explained](/guides/agent-hooks-explained/).",
          },
        ],
      },
      {
        id: "phone",
        title: "Phone push (ntfy) and Slack when Cursor finishes",
        blocks: [
          {
            kind: "p",
            text: "By hand, a hook can post to [ntfy](https://ntfy.sh). Install the ntfy app, subscribe to a topic nobody could guess (anyone who knows a public topic name can read it), and use it here:",
          },
          { kind: "code", lang: "json", code: CURSOR_HOOK_NTFY },
          {
            kind: "p",
            text: "With anotifier, answer yes to the ntfy question during setup. It creates a random topic, you subscribe to it in the app, and `anotifier test ntfy` should buzz your phone. The push is titled `Cursor` with the body `Task complete`. The full walkthrough is in the [phone push guide](/guides/ntfy-phone-notifications/).",
          },
          {
            kind: "p",
            text: "For Slack, create an incoming webhook and put it in `~/.anotifier/config.json`. Every Cursor finish then posts one message to the channel:",
          },
          { kind: "code", lang: "json", code: CURSOR_SLACK_CONFIG },
          {
            kind: "p",
            text: "See the [Slack page](/slack/) for the webhook steps. Discord and Telegram use a different `format`.",
          },
        ],
      },
      {
        id: "windows",
        title: "Cursor notifications on Windows and WSL",
        blocks: [
          {
            kind: "ul",
            items: [
              "**Windows.** The user hooks file is `%USERPROFILE%\\.cursor\\hooks.json`. Run setup in PowerShell, not in WSL. Setup also checks for PowerShell 7 (`pwsh`) and installs the BurntToast module for your user, so a toast arrives with the Cursor icon and a Windows notification sound. If `pwsh` is missing it prints `winget install --id Microsoft.PowerShell --source winget`. `anotifier test toast` confirms the toast works.",
              "**Hand-written hooks on Windows** can't use `notify-send`. Use the PowerShell toast above, and if nothing appears check that Do not disturb (Focus Assist) is off.",
              "**WSL.** Setup only looks in the home folder of the shell it runs in. If you run Cursor on Windows, run setup in PowerShell on Windows. If you run Cursor's agent from inside WSL, run it inside WSL, where the toast goes out through Windows interop. Cursor's hooks docs don't say which side runs a hook when a window is connected to WSL, so check with a real run: if the alert doesn't arrive, run `anotifier status` on both sides to see which one has the hook.",
            ],
          },
          {
            kind: "p",
            text: "Details for both are in [Agent notifications on Windows and WSL](/guides/windows-wsl-notifications/) and [Windows toast from WSL](/guides/wsl-notify-send/).",
          },
        ],
      },
      {
        id: "troubleshooting",
        title: "Cursor notification not showing? Fixes by symptom",
        blocks: [
          {
            kind: "table",
            head: ["Symptom", "Likely cause", "What to do"],
            rows: [
              [
                "Nothing at all after a run",
                "The hook isn't in the file Cursor reads, or didn't load",
                "Run `anotifier status` and look for Cursor `wired`. Open the Hooks tab under Customize and the Hooks output channel for errors; restart Cursor if the hook still doesn't load",
              ],
              [
                "`anotifier test toast` works, real runs are silent",
                "The problem is between Cursor and anotifier",
                "Check `~/.cursor/hooks.json` has a `stop` entry, then check `anotifier status` for snooze and quiet hours, which silence every channel on purpose",
              ],
              [
                "The Hooks output channel says `node` was not found",
                "anotifier's hook command starts with `node`, so Cursor's hook environment has to find Node",
                "Start Cursor from a terminal where `node -v` works, or put Node on the system PATH, and restart Cursor",
              ],
              [
                "My own hook never shows a banner",
                "The command exits with a code other than 0, and Cursor lets the agent carry on without telling you",
                'Run it by hand with a sample payload: `echo \'{"status":"completed","loop_count":0}\' | ./hooks/notify.sh`, and fix whatever it prints',
              ],
              [
                "Two notifications for one run",
                "The same hook is in `~/.cursor/hooks.json` and in a project's `.cursor/hooks.json`; Cursor runs both",
                "Keep it in one file. anotifier also drops a second `stop` within 1.5 seconds, but a hand-written hook doesn't",
              ],
              [
                "`Task complete` after I stopped the agent or it errored",
                "anotifier doesn't read the event's `status`",
                "Use the script above, which prints `completed`, `aborted` or `error`",
              ],
              [
                "Toast works, phone doesn't",
                "ntfy skipped in setup, or a wrong topic in the app",
                "`anotifier test ntfy`, then the [phone push troubleshooting](/guides/ntfy-phone-notifications/#trouble)",
              ],
            ],
          },
          {
            kind: "p",
            text: "The order of checks that works for any agent is in the [troubleshooting guide](/guides/notifications-not-working/).",
          },
        ],
      },
      {
        id: "mute",
        title: "Turn off Cursor notifications",
        blocks: [
          {
            kind: "table",
            head: ["To stop", "Do this"],
            rows: [
              [
                "Cursor's own sound or OS notification",
                "Turn off the matching option in Cursor's Settings (see the first section)",
              ],
              [
                "A hand-written hook",
                "Delete its entry from `hooks.json`; Cursor reloads the file",
              ],
              [
                "anotifier for a while",
                "`anotifier snooze 2h` silences every channel until it expires; `anotifier snooze off` cancels it. Quiet hours (`quietHours.enabled` in `~/.anotifier/config.json`, off by default) do the same every night",
              ],
              [
                "anotifier's Cursor alert only",
                "Delete the `stop` entry whose command contains `--source cursor`. Running setup again puts it back",
              ],
              ["anotifier for good", "`npx anotifier@latest uninstall`"],
            ],
          },
          {
            kind: "note",
            text: "`uninstall` asks for confirmation, then removes anotifier's hooks from every agent it wired, not just Cursor, after backing up each file. It leaves your own hooks and your settings in `~/.anotifier`. Snooze and quiet hours silence anotifier only; Cursor's own sound and notifications keep going until you change them.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does Cursor have a built-in notification when the agent finishes?",
        a: "Yes, two. Cursor 0.48 added an option to play a sound when a chat is ready for review, and Cursor 1.5 added native OS notifications for a finished agent run or when input is required. Both stay on the computer running Cursor and use Cursor's own wording; for a phone push, Slack or your own text, add a stop hook.",
      },
      {
        q: "How do I get a Cursor notification on my phone when the agent is done?",
        a: 'Add a stop hook to ~/.cursor/hooks.json that posts to ntfy, for example curl -s -d "Cursor agent finished" ntfy.sh/your-secret-topic, and subscribe to that topic in the ntfy app. npx anotifier@latest setup does the same with a random private topic and also covers Slack, Discord and Telegram.',
      },
      {
        q: "What is the Cursor stop hook and what does it receive?",
        a: "stop is the hooks.json event that fires when the agent loop ends. Its stdin JSON carries status (completed, aborted or error) and loop_count, plus common fields such as conversation_id, generation_id and workspace_roots. Exit 0 and print nothing for a plain notification; printing a followup_message makes Cursor send it as the next prompt.",
      },
      {
        q: "Why did I get two Cursor notifications for one run?",
        a: "Cursor runs the matching hooks from every hooks.json, so the same hook in ~/.cursor and in a project's .cursor folder fires twice. Cursor has also been seen firing a hook twice for one run; anotifier drops a repeat of the same event within 1.5 seconds, but a hand-written hook needs its own guard.",
      },
      {
        q: "Does the Cursor CLI (cursor-agent) notify when it finishes?",
        a: "Cursor's CLI changelog lists desktop notifications from April 2026 for a finished turn and for approvals, questions and sudo prompts, in iTerm2, Ghostty, Warp, Kitty and Terminal.app, and it added hooks in January 2026. anotifier's tests don't run the Cursor CLI, so whether its stop hook fires there is untested.",
      },
      {
        q: "How do I turn Cursor notifications off?",
        a: "Turn off the sound and notification options in Cursor's Settings for the built-in ones, delete a hand-written entry from hooks.json, run anotifier snooze 2h to pause anotifier, or run npx anotifier@latest uninstall to remove it from every agent.",
      },
    ],
  },
  {
    slug: "gemini-cli-notifications",
    updated: "2026-10-09",
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
            text: 'Antigravity CLI has hooks too, in a new format: it reads them from files such as `~/.gemini/config/hooks.json` or a workspace\'s `.agents/hooks.json`, and its events are `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`. There is no `AfterAgent` or `Notification` event, so the Gemini CLI hooks above don\'t fire there. anotifier 1.4.0 and later support it separately: `npx anotifier setup` adds one group named `anotifier` with a `Stop` handler to `~/.gemini/config/hooks.json` when `~/.gemini/antigravity-cli` exists, and a finished run sends "Task complete". Limits: there is no needs-input alert (Antigravity has no such event), a `Stop` caused by an error or cancel also says "Task complete", and it has not yet been tested against a live Antigravity CLI. Google\'s [Antigravity hooks docs](https://antigravity.google/docs/hooks/) describe the format. For a hook you write yourself, see the [Antigravity CLI notifications guide](/guides/antigravity-cli-notifications/); for what setup writes, the [Antigravity CLI page](/antigravity-cli/).',
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
  ...ANTIGRAVITY_GUIDES,
  ...TOPIC_GUIDES,
  ...WSL_GUIDES,
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export const GUIDES_TITLE =
  "Notification Guides for Claude Code, Codex, Cursor & Gemini";
export const GUIDES_DESCRIPTION =
  "Guides to notifications from Claude Code, Codex CLI, Cursor and Gemini CLI: per-agent setup, Windows, WSL, macOS, Linux, hooks, phone push and fixes.";
