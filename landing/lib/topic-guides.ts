import type { Guide } from "./guides";

/**
 * Topic guides: platforms and features every agent shares. Every claim here is
 * checked against the package source (cli/, src/, setup/, assets/) for the
 * version in lib/site.ts; where the product has a known gap, the guide says so
 * instead of papering over it.
 */
export const TOPIC_GUIDES: Guide[] = [
  {
    slug: "windows-wsl-notifications",
    kind: "topic",
    name: "Windows & WSL",
    title: "Claude Code & Codex Notifications on Windows and WSL",
    description:
      "How coding-agent notifications work on Windows and inside WSL: BurntToast toasts, click-to-focus, what WSL toasts can't do, and how to test them.",
    h1: "Agent notifications on Windows and WSL",
    intro:
      "anotifier runs the same hooks on Windows and inside WSL, but the toast takes a different road on each. Native Windows uses PowerShell 7 and the BurntToast module for a full toast with the agent's icon, a sound, and click-to-focus. Inside WSL, the Linux side hands the toast to Windows through interop, which gives a plainer banner. Here is what each path needs and how to check it.",
    sections: [
      {
        id: "native",
        title: "Native Windows: PowerShell 7 and BurntToast",
        blocks: [
          {
            kind: "p",
            text: "On Windows every toast is sent by `pwsh` (PowerShell 7) running anotifier's `toast.ps1`, which uses the [BurntToast](https://github.com/Windos/BurntToast) module. `anotifier setup` installs BurntToast for your user with `Install-Module BurntToast -Scope CurrentUser`; nothing is ever installed while a hook runs.",
          },
          {
            kind: "code",
            lang: "powershell",
            code: "winget install --id Microsoft.PowerShell --source winget\nnpx anotifier@latest setup\nanotifier test toast",
          },
          {
            kind: "ul",
            items: [
              "**PowerShell 7 is required.** Windows PowerShell 5.1 (`powershell.exe`) on its own is not enough for native toasts.",
              "Each toast carries the agent's own icon and a title like `my-app · Claude Code`.",
              "Sounds are the Windows notification sounds: `Default`, `IM`, `Mail`, `Reminder`, `SMS`, `Alarm`. Finished tasks play `IM`; approvals and questions play `Reminder`. Change them per event with `events.<event>.toastSound`.",
              "If BurntToast is missing or fails, you hear the Windows exclamation sound instead of seeing a toast, and the failure is logged to `~/.anotifier/errors.log` as `toast:windows`.",
            ],
          },
        ],
      },
      {
        id: "click-to-focus",
        title: "Click-to-focus",
        blocks: [
          {
            kind: "p",
            text: "Clicking a toast brings the terminal or editor window that ran the agent to the front, so an approval prompt is one click away. On first use anotifier registers an `agentfocus://` link handler for your user under `HKCU\\Software\\Classes\\agentfocus`, finds the window by walking up from the hook's process to the terminal or IDE that owns it, and puts that window in the toast's launch link. To turn it off:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "toast": { "clickToFocus": false } }',
          },
          {
            kind: "note",
            text: "`anotifier uninstall` removes the hooks. In 1.2.6 it leaves the `agentfocus` registry key in place; from the release after 1.2.6 it removes that key too, but only when the key points at anotifier's own focus script, so a handler another program registered is left alone. The BurntToast module stays installed either way, since other tools may use it. For a completely clean machine, remove what is left by hand: `Remove-Item -Recurse HKCU:\\Software\\Classes\\agentfocus` and `Uninstall-Module BurntToast`.",
          },
        ],
      },
      {
        id: "wsl",
        title: "Inside WSL: toasts through Windows interop",
        blocks: [
          {
            kind: "p",
            text: "When an agent runs inside a WSL distribution, anotifier detects WSL (from the kernel version string, `/proc/version`, or the `WSL_INTEROP` and `WSL_DISTRO_NAME` variables) and sends the toast through Windows instead of `notify-send`. Docker containers are not mistaken for WSL. It converts its script path with `wslpath -w`, then tries these in order and remembers the first that works:",
          },
          {
            kind: "ol",
            items: [
              "`/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`",
              "`powershell.exe` on the PATH",
              "`/mnt/c/Program Files/PowerShell/7/pwsh.exe`",
              "`pwsh.exe` on the PATH",
            ],
          },
          {
            kind: "p",
            text: "The WSL toast is deliberately simple. It calls the Windows toast API directly, so it needs no BurntToast, and it shows the title and message under Windows PowerShell's name. It has no custom sound, no per-agent icon, and no click-to-focus. Phone push, webhooks, and the terminal bell work exactly as on Linux.",
          },
          {
            kind: "ul",
            items: [
              "Run `npx anotifier@latest setup` **inside** the distribution. Agents in WSL read their settings from the Linux home directory, so a Windows-side setup does not wire them.",
              "Windows interop must be on (the WSL default) and PowerShell must be reachable through `/mnt/c` or the PATH. With `enabled = false` under `[interop]` in `/etc/wsl.conf`, there is no route to a toast.",
            ],
          },
          {
            kind: "note",
            text: "In 1.2.6, `setup`, `status`, and `doctor` describe WSL as plain Linux, so they may warn that `notify-send` is missing. That warning does not apply to WSL toasts, and a failed WSL toast is not written to `errors.log`. The release after 1.2.6 fixes both: all three commands name the Windows-interop toast path, `doctor` checks for `wslpath` and a reachable Windows PowerShell instead of `notify-send`, and a failed WSL toast is logged as `toast:wsl`. On any version, `anotifier test toast`, which prints `Toast sent` or `Toast failed`, is the real check.",
          },
        ],
      },
      {
        id: "check",
        title: "Test and troubleshoot on Windows",
        blocks: [
          {
            kind: "code",
            lang: "powershell",
            code: "anotifier test toast   # real toast: prints Toast sent or Toast failed\nanotifier doctor       # PowerShell, BurntToast and execution policy\nanotifier status       # wired agents and the last 8 errors",
          },
          {
            kind: "ul",
            items: [
              "Native toasts need PowerShell 7. In 1.2.6, `anotifier doctor` also passes with only Windows PowerShell 5.1, so if doctor is green and `test toast` fails, install PowerShell 7 and run setup again. From the release after 1.2.6, `doctor` fails when PowerShell 7 is missing and `setup` warns about it, both with the `winget` command to install it.",
              "`test toast` says `Toast sent` but nothing appears: Do not disturb (Focus Assist) may be on. anotifier does not detect it; check **Settings > System > Notifications**.",
              "`doctor --deep` has no read-back on Windows yet; it reports that deep verification is not available there.",
              "Still stuck? The [troubleshooting guide](/guides/notifications-not-working/) walks through every check.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Do I need BurntToast inside WSL?",
        a: "No. WSL toasts call the Windows toast API directly through Windows PowerShell. BurntToast is only used for native Windows toasts, and setup installs it there for you.",
      },
      {
        q: "Why does my WSL toast look different from the native one?",
        a: "The WSL path is a minimal toast shown under Windows PowerShell's name: title and message only, with no per-agent icon, no custom sound, and no click-to-focus. Native Windows toasts go through BurntToast and have all three.",
      },
      {
        q: "Which window does click-to-focus bring forward?",
        a: "The terminal or editor that launched the agent. anotifier walks up the process tree from the hook to the first process that owns a window, such as Windows Terminal, VS Code, or Cursor.",
      },
      {
        q: "Are Windows notifications tested?",
        a: "Native Windows toasts are verified in CI on a real Windows runner by reading them back out of Windows' own notification database. The WSL path has unit tests but no end-to-end CI run, because hosted runners cannot start WSL.",
      },
    ],
  },
  {
    slug: "macos-linux-notifications",
    kind: "topic",
    name: "macOS & Linux",
    title: "Claude Code & Codex Notifications on macOS and Linux",
    description:
      "How coding-agent alerts work on macOS (osascript, Notification Center permissions) and Linux (notify-send), and how to test that banners actually arrive.",
    h1: "Agent notifications on macOS and Linux",
    intro:
      "On macOS and Linux anotifier uses the notification tool the operating system already has: `osascript` on a Mac and `notify-send` on Linux. Nothing runs in the background, and on macOS nothing extra is installed. Here is what each backend shows, what it needs, and how to check that banners really arrive.",
    sections: [
      {
        id: "macos",
        title: "macOS: osascript and Notification Center",
        blocks: [
          {
            kind: "p",
            text: "Each toast is an AppleScript `display notification` call with the title (`my-app · Claude Code`), the message, and a sound. There is no helper app to install, which also means no custom icon and no click action: macOS shows the banner under the app it attributes AppleScript notifications to, usually Script Editor or your terminal.",
          },
          {
            kind: "p",
            text: "Sounds map to built-in macOS sounds: finished tasks (`IM`) play Glass and approvals or questions (`Reminder`) play Ping. `Mail` maps to Purr, `SMS` to Tink, and `Alarm` to Sosumi. You can also name any built-in sound directly:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "events": { "task_complete": { "toastSound": "Hero" } } }',
          },
          {
            kind: "ul",
            items: [
              "No banners? Open **System Settings > Notifications**, find Script Editor (or your terminal app) and allow notifications. The entry only appears after a first notification has been sent, so run `anotifier test toast` once first.",
              "`anotifier doctor` reads that permission and warns when the app is not allowed. macOS does not expose this officially, so doctor treats the reading as best-effort.",
              "`anotifier doctor --deep` sends a marker notification and reads it back from Notification Center's database, waiting up to 15 seconds. If the database can't be read, grant your terminal Full Disk Access in **System Settings > Privacy & Security**.",
              "A Focus mode can hide the banner while macOS still records it as delivered, and doctor cannot tell whether a Focus is on.",
            ],
          },
        ],
      },
      {
        id: "linux",
        title: "Linux: notify-send",
        blocks: [
          {
            kind: "p",
            text: "On Linux each toast is a `notify-send` call with the agent's icon, the title, and the message. It needs a desktop session with a notification daemon (GNOME, KDE Plasma, and most desktops ship one) and the libnotify command-line tool:",
          },
          {
            kind: "code",
            lang: "bash",
            code: "sudo apt install libnotify-bin   # Debian, Ubuntu\nsudo dnf install libnotify       # Fedora\nsudo pacman -S libnotify         # Arch",
          },
          {
            kind: "p",
            text: "Priority becomes urgency. Approvals and questions go out `critical`, which the notification spec says should stay on screen until you dismiss it; finished tasks go out `low`. Sound names are ignored on Linux.",
          },
          {
            kind: "p",
            text: "On a server, or over SSH with no desktop session, `notify-send` has nowhere to deliver. The toast fails, the failure is logged to `~/.anotifier/errors.log` as `toast:linux`, and ntfy, webhooks, and the bell still deliver. On remote machines, [phone push](/guides/ntfy-phone-notifications/) is the channel to rely on.",
          },
          {
            kind: "ul",
            items: [
              "`anotifier doctor` warns when `notify-send` is missing.",
              "`anotifier doctor --deep` sends a low-urgency toast and reads it back from `dunstctl history` if you run dunst. Other notification daemons report dispatched-but-unverified.",
            ],
          },
        ],
      },
      {
        id: "test",
        title: "Test it",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "anotifier test toast    # prints Toast sent or Toast failed\nanotifier doctor --deep # send a marker and read it back",
          },
          {
            kind: "p",
            text: "If the test works but real notifications don't, the hook is the problem, not the backend: see the [troubleshooting guide](/guides/notifications-not-working/).",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Why don't macOS notifications show the anotifier or agent icon?",
        a: "AppleScript banners always use the icon of the app macOS attributes them to, usually Script Editor or your terminal. anotifier puts the project and agent in the title instead: my-app · Claude Code.",
      },
      {
        q: "Do I need terminal-notifier?",
        a: "No. anotifier only uses osascript, which ships with macOS.",
      },
      {
        q: "Does it work on Wayland?",
        a: "Yes. notify-send talks to the notification daemon over D-Bus, which works the same under Wayland and X11.",
      },
      {
        q: "Can a headless Linux box notify my phone?",
        a: "Yes. Toasts need a desktop, but ntfy push and webhooks work anywhere with network access. Enable ntfy during setup and subscribe to the topic in the ntfy app.",
      },
    ],
  },
  {
    slug: "agent-hooks-explained",
    kind: "topic",
    name: "Agent hooks",
    title: "Agent Hooks Explained: Claude Code, Codex, Cursor, Gemini",
    description:
      "Which hook events Claude Code, Codex CLI, Cursor and Gemini CLI fire when they finish or need you, where each is configured, and what anotifier writes.",
    h1: "How agent hooks power your notifications",
    intro:
      "Every coding agent anotifier supports can run a command at fixed points in its lifecycle. Those hooks are all anotifier uses: setup adds one entry per event to each agent's own config file, the agent runs it, and the hook turns the event into a notification. No wrapper, no daemon, no polling. This page lists exactly what gets written where, and what happens when a hook fires.",
    sections: [
      {
        id: "events",
        title: "The events, per agent",
        blocks: [
          {
            kind: "table",
            head: ["Agent", "Config file", "Finished", "Needs you", "Timeout"],
            rows: [
              [
                "Claude Code",
                "`~/.claude/settings.json`",
                "`Stop`",
                "`Notification`",
                "10 s",
              ],
              [
                "Codex CLI",
                "`~/.codex/hooks.json`",
                "`Stop`",
                "`PermissionRequest`",
                "10 s",
              ],
              ["Cursor", "`~/.cursor/hooks.json`", "`stop`", "None", "Not set"],
              [
                "Gemini CLI",
                "`~/.gemini/settings.json`",
                "`AfterAgent`",
                "`Notification`",
                "30 s",
              ],
            ],
          },
          {
            kind: "p",
            text: 'Codex also gets a `SessionStart` hook. Each agent event maps to one of three anotifier events: `task_complete` (default priority), `needs_input` (urgent), or `session_start` (low, and quiet by default). Claude Code\'s idle reminder ("Claude is waiting for your input") arrives as `needs_input` at default priority instead of urgent. The [docs](/docs/) list every per-event setting.',
          },
        ],
      },
      {
        id: "entry",
        title: "What an entry looks like",
        blocks: [
          {
            kind: "p",
            text: "Every hook runs the same script, `src/notify.mjs` from the installed package, with `--source` naming the agent. This is the Claude Code entry setup writes under both `Stop` and `Notification`:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": [\n    {\n      "type": "command",\n      "command": "node \\"/path/to/anotifier/src/notify.mjs\\" --source claude",\n      "timeout": 10\n    }\n  ],\n  "_managed_by": "anotifier",\n  "matcher": ""\n}',
          },
          {
            kind: "ul",
            items: [
              "**Codex and Cursor** validate their files strictly, so their entries carry no `_managed_by` marker. Instead they pass `--event <name>`, because those agents don't include the event name in the hook's input. Codex entries also set `statusMessage: \"Sending notification\"`.",
              '**Cursor** uses its flat format: `{ "command": "node ... --source cursor --event stop" }` under `hooks.stop`, with `version: 1`.',
              "**Gemini CLI** reads hooks from `settings.json`, not a separate hooks file, and takes its timeout in milliseconds (`30000`).",
            ],
          },
        ],
      },
      {
        id: "delivery",
        title: "What happens when a hook fires",
        blocks: [
          {
            kind: "ol",
            items: [
              "The agent starts `notify.mjs` and writes the event as JSON to its stdin. anotifier waits at most 500 ms for it.",
              "If snooze or quiet hours is active, it stops here and sends nothing. The same goes for a Claude Code `Stop` that fires while background tasks are still running; the real completion notifies later.",
              "Duplicates are dropped. A lock file per agent, event, and session collapses repeats within 1.5 seconds, which matters for Cursor, which can fire `stop` twice for one run.",
              "The notification is built: the title is `my-app · Claude Code`, and for Claude Code the body is the last thing Claude said (or its question), read from the transcript and capped at 180 characters. Other agents send generic text such as `my-app: Task complete`.",
              "Every enabled channel is sent in parallel, each with its own timeout: 5 to 7 seconds for the toast and 5 for ntfy.",
              "The hook exits 0 with the reply the agent expects. For Claude Code that reply rings the terminal bell through Claude Code's own output. Errors go to `~/.anotifier/errors.log`, never into the agent session.",
            ],
          },
        ],
      },
      {
        id: "codex",
        title: "Codex: the feature flag and trust hashes",
        blocks: [
          {
            kind: "p",
            text: "Codex only runs hooks when `hooks = true` is set under `[features]` in `~/.codex/config.toml`, and only hooks it trusts. Each hook needs a `trusted_hash` under `[hooks.state]`, keyed by the hooks file path, the event, and the entry's position. Setup writes both, and migrates the older `codex_hooks = true` flag.",
          },
          {
            kind: "code",
            lang: "toml",
            code: "[features]\nhooks = true",
          },
          {
            kind: "p",
            text: "Codex skips a hook without a matching hash, so if you edit one by hand it stops firing. Running `npx anotifier@latest setup` again rewrites the hashes. Hooks fire in the interactive Codex TUI, not in `codex exec`.",
          },
        ],
      },
      {
        id: "safety",
        title: "Backups, re-runs, and uninstall",
        blocks: [
          {
            kind: "ul",
            items: [
              "Before changing a file that already exists, setup copies it to `~/.anotifier/backups/<file>.<timestamp>.backup`.",
              "anotifier recognises its own entries by the marker or by the `notify.mjs` command path, so re-running setup replaces them in place and leaves your own hooks alone.",
              "`anotifier uninstall` asks for confirmation, backs up each file, and removes only anotifier's entries (plus any hook arrays that end up empty) and its Codex trust hashes. It keeps `~/.anotifier/` with your config and backups, and leaves Codex's `hooks = true` flag set.",
              "The Claude Code plugin registers the same `Stop` and `Notification` hooks from inside the plugin. `anotifier uninstall` doesn't touch those; remove the plugin from Claude Code's `/plugin` menu.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Do I need to restart the agent after setup?",
        a: 'Yes. Setup finishes with "Restart your AI tools to activate." A session that was already running may not pick up the new hooks.',
      },
      {
        q: "Can a notification hook slow down or break my agent?",
        a: "anotifier's hook always exits 0 and sends every channel in parallel with short per-channel timeouts, so a dead network or a missing toast tool costs seconds at most and never fails the agent's turn. Failures are written to ~/.anotifier/errors.log.",
      },
      {
        q: "Will setup overwrite hooks I wrote myself?",
        a: "No. It only replaces entries it recognises as its own, and backs up each file before writing.",
      },
      {
        q: "Why does Cursor have no needs-input notification?",
        a: "anotifier registers only Cursor's stop event, which fires when the agent loop ends. Cursor notifications are about finished runs.",
      },
    ],
  },
  {
    slug: "notifications-not-working",
    kind: "topic",
    name: "Troubleshooting",
    title: "Agent Notifications Not Working? Troubleshooting Guide",
    description:
      "Not getting alerts from Claude Code, Codex, Cursor or Gemini CLI? Check hooks, restarts, snooze, quiet hours, toast backends and ntfy, in that order.",
    h1: "Notifications not arriving? Work through this list",
    intro:
      "When a notification doesn't show up, the cause is almost always one of a few things: the hook isn't wired, the agent wasn't restarted, notifications are paused, or the operating system is hiding the banner. anotifier has three commands that tell you which: `status`, `test`, and `doctor`. Start at the top and stop when you find it.",
    sections: [
      {
        id: "status",
        title: "Step 1: run anotifier status",
        blocks: [
          { kind: "code", lang: "bash", code: "anotifier status" },
          {
            kind: "ul",
            items: [
              "**Tools**: each agent shows `wired` with its events, `not wired`, `not installed`, or `config error`. `not wired` means setup hasn't patched that agent yet: run `npx anotifier@latest setup`. Claude Code only counts as installed once `~/.claude/settings.json` exists, so start Claude Code once before running setup.",
              "**Snooze** and **Quiet hours**: a snooze time, or quiet hours marked `(active now)`, means every channel is silenced on purpose. `anotifier snooze off` ends a snooze early.",
              "**Recent errors**: the last 8 hook errors from `~/.anotifier/errors.log`, each tagged with what failed (`toast:windows`, `toast:linux`, `ntfy`, `webhook`, and so on). Failed WSL toasts are logged as `toast:wsl` from the release after 1.2.6; 1.2.6 does not log them.",
              "If `status` itself stops with `Config error`, `~/.anotifier/config.json` is invalid JSON or has a bad value. Fix it, or run setup and let it rebuild the file.",
            ],
          },
        ],
      },
      {
        id: "test",
        title: "Step 2: send a test",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "anotifier test           # toast, phone push and bell (plus webhook if enabled)\nanotifier test toast\nanotifier test ntfy\nanotifier test webhook",
          },
          {
            kind: "p",
            text: "`test` sends straight to the channel. It skips the agent's hook, snooze, and quiet hours, which makes the result easy to read:",
          },
          {
            kind: "ul",
            items: [
              "**The test arrives but real notifications don't**: the problem is between the agent and anotifier. Restart the agent (a session started before setup doesn't have the hooks), re-run setup, and check snooze and quiet hours in `status`.",
              "**The test fails too**: the channel itself is broken. `test` exits with code 1 and says which one; continue with step 3.",
            ],
          },
        ],
      },
      {
        id: "doctor",
        title: "Step 3: run anotifier doctor",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "anotifier doctor\nanotifier doctor --deep",
          },
          {
            kind: "table",
            head: ["Check", "What it looks at"],
            rows: [
              [
                "`toast-backend`",
                "The OS toast tool: PowerShell, BurntToast and the execution policy on Windows, `osascript` on macOS, `notify-send` on Linux. Inside WSL, 1.2.6 also checks `notify-send`, which WSL toasts never use; from the release after 1.2.6 it checks `wslpath` and a reachable Windows PowerShell instead.",
              ],
              [
                "`toast-auth`",
                "macOS only: whether Notification Center allows the app that shows AppleScript banners.",
              ],
              [
                "`bell`",
                "Whether your terminal will ring. The VS Code and Windsurf terminals swallow the bell.",
              ],
              [
                "`ntfy-config`",
                "Whether a server and topic are set. It does not contact the server; `test ntfy` does.",
              ],
              ["`webhook-config`", "Whether the webhook is set up."],
              ["`config`", "Whether `~/.anotifier/config.json` is valid."],
            ],
          },
          {
            kind: "p",
            text: "`--deep` goes further on macOS and Linux: it sends a real marker notification and reads it back from Notification Center's database (macOS) or dunst's history (Linux). On Windows it reports that deep verification isn't available. `doctor` exits 1 if any check fails, and `--json` prints the results with the check names above.",
          },
        ],
      },
      {
        id: "causes",
        title: "Common causes and fixes",
        blocks: [
          {
            kind: "table",
            head: ["Symptom", "Likely cause", "Fix"],
            rows: [
              [
                "One agent never notifies, `test` works",
                "Hook not wired, or the session started before setup",
                "Run setup, then restart the agent",
              ],
              [
                "Codex never notifies",
                "Hooks flag off, stale trust hashes, or running `codex exec`",
                "Re-run setup; use the interactive TUI. See [agent hooks](/guides/agent-hooks-explained/)",
              ],
              [
                "Claude Code approval alerts arrive a few seconds late",
                "Claude Code holds its `permission_prompt` notification for about six seconds",
                "Expected. See [Claude Code permission notifications](/guides/claude-code-permission-notifications/)",
              ],
              [
                "Nothing at all, for a while",
                "Snooze or quiet hours",
                "`anotifier snooze off`; check `quietHours` in the config",
              ],
              [
                "Windows: `Toast failed`",
                "PowerShell 7 or BurntToast missing",
                "Install PowerShell 7, then re-run setup. See [Windows & WSL](/guides/windows-wsl-notifications/)",
              ],
              [
                "Windows: `Toast sent`, no banner",
                "Do not disturb (Focus Assist)",
                "**Settings > System > Notifications**",
              ],
              [
                "WSL: `Toast failed`",
                "Windows interop off, or PowerShell not reachable",
                "See [Windows & WSL](/guides/windows-wsl-notifications/)",
              ],
              [
                "macOS: `Toast sent`, no banner",
                "Notifications not allowed for Script Editor or your terminal, or a Focus mode",
                "**System Settings > Notifications**. See [macOS & Linux](/guides/macos-linux-notifications/)",
              ],
              [
                "Linux: `Toast failed`",
                "`notify-send` missing, or no desktop session",
                "Install libnotify; on headless machines use ntfy",
              ],
              [
                "Phone stays silent",
                "Not subscribed to the topic, or the topic differs",
                "Compare the ntfy URL in `status` with the app. See [ntfy](/guides/ntfy-phone-notifications/)",
              ],
              [
                "No bell in VS Code",
                "The integrated terminal ignores the bell",
                "Rely on the toast; `doctor` warns about this",
              ],
            ],
          },
        ],
      },
      {
        id: "report",
        title: "Still stuck?",
        blocks: [
          {
            kind: "p",
            text: "Open an issue on [GitHub](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/issues) with the output of `anotifier doctor --json` and `anotifier status`, plus the matching lines from `~/.anotifier/errors.log`. Remove your ntfy topic first: `status` prints the full ntfy URL (it only shows a webhook's origin).",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Where does anotifier log errors?",
        a: "~/.anotifier/errors.log, one JSON object per line with a timestamp, the failing context (such as toast:macos or ntfy), and the message. The file is capped at 128 KB, keeping the newest half when it grows past that. anotifier status shows the last 8 entries.",
      },
      {
        q: "Does anotifier test respect snooze and quiet hours?",
        a: "No. test always sends, so you can check a channel while notifications are paused. Real hook events do respect both.",
      },
      {
        q: "Why does status say Claude Code is not installed?",
        a: "anotifier looks for ~/.claude/settings.json. Start Claude Code once so it creates the file, then run setup again.",
      },
      {
        q: "I get notifications, but only a generic message. Why?",
        a: "Only Claude Code exposes what the agent said, and only the toast and webhook show it by default. ntfy stays generic unless you turn on ntfy.richContent, and Codex, Cursor and Gemini CLI always send generic text such as my-app: Task complete.",
      },
    ],
  },
  {
    slug: "ntfy-phone-notifications",
    kind: "topic",
    name: "ntfy phone push",
    title: "Phone Notifications for Claude Code & Codex with ntfy",
    description:
      "Get a push on your phone when Claude Code, Codex, Cursor or Gemini CLI finishes or needs approval: ntfy setup, private topics, self-hosting, testing.",
    h1: "Phone push for your coding agents, with ntfy",
    intro:
      "[ntfy](https://ntfy.sh) is a free, open-source push service: you subscribe to a topic in the ntfy app, and anything posted to that topic arrives on your phone. There is no account to create. anotifier uses it as its phone channel, so a finished run or a pending approval reaches you away from your desk.",
    sections: [
      {
        id: "setup",
        title: "Set it up in two minutes",
        blocks: [
          {
            kind: "ol",
            items: [
              "Install the ntfy app on Android (Google Play or F-Droid) or iOS (App Store).",
              "Run `npx anotifier@latest setup` and answer yes to **Enable phone notifications via ntfy?** Keep the default server, `https://ntfy.sh`, and the generated topic: `anotifier-` followed by 16 random letters and digits.",
              "Setup prints the topic and its URL. In the app, subscribe to that topic name.",
              "Run `anotifier test ntfy`. Your phone should buzz within a second.",
            ],
          },
        ],
      },
      {
        id: "what",
        title: "What arrives on your phone",
        blocks: [
          {
            kind: "table",
            head: ["Event", "ntfy priority", "Tags"],
            rows: [
              ["Task finished", "default", "`white_check_mark`"],
              ["Approval or question", "urgent", "`bell`, `warning`"],
              [
                "Claude Code idle reminder",
                "default",
                "`hourglass_flowing_sand`",
              ],
              ["Session start", "not sent", "None"],
            ],
          },
          {
            kind: "p",
            text: "The title is `my-app · Claude Code`, sent encoded so accents and emoji in project names survive. The body is generic text such as `my-app: Task complete`: anotifier keeps conversation text out of ntfy by default (`ntfy.richContent` is `false`), because anyone who knows a public topic name can read it.",
          },
        ],
      },
      {
        id: "private",
        title: "Keep the topic private",
        blocks: [
          {
            kind: "ul",
            items: [
              "On ntfy.sh, a topic is readable by anyone who knows its name. The generated 16-character name is hard to guess; don't replace it with something short like `claude`.",
              "Keep the topic out of public issues and screenshots. `anotifier status` prints the full ntfy URL.",
              "Want Claude's actual words on your phone? Run your own ntfy server and turn on `richContent` for it (below).",
            ],
          },
        ],
      },
      {
        id: "self-host",
        title: "Use your own ntfy server",
        blocks: [
          {
            kind: "code",
            lang: "json",
            code: '{\n  "ntfy": {\n    "enabled": true,\n    "server": "https://ntfy.example.com",\n    "topic": "anotifier-your-topic",\n    "click": "",\n    "richContent": true\n  }\n}',
          },
          {
            kind: "ul",
            items: [
              "Any ntfy server works, over https or http; a trailing slash is ignored.",
              "`click` is an optional URL to open when you tap the notification.",
              "`anotifier config ntfy` edits the server, topic, icon, and click URL interactively. `richContent` is only set in `~/.anotifier/config.json`.",
              "anotifier doesn't send ntfy access tokens, so the server must allow anonymous publishing to your topic.",
            ],
          },
        ],
      },
      {
        id: "trouble",
        title: "When the phone stays silent",
        blocks: [
          {
            kind: "ul",
            items: [
              "`anotifier test ntfy` prints `ntfy not configured` if ntfy was skipped during setup: run setup again, or `anotifier config ntfy`.",
              "`ntfy failed`: check the server URL, then look in `~/.anotifier/errors.log` for `ntfy server responded <code>` or a timeout (anotifier gives ntfy 5 seconds).",
              "ntfy.sh is a free public service with its own usage limits; normal agent traffic stays well below them, but a script firing many pushes can hit them. A self-hosted server has whatever limits you set.",
              "The test arrives but real events don't: the hook is the problem. See the [troubleshooting guide](/guides/notifications-not-working/).",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Is ntfy free?",
        a: "Yes. ntfy is open source, the public ntfy.sh server is free to use, and you can run your own server instead.",
      },
      {
        q: "Do I need an ntfy account?",
        a: "No. You subscribe to a topic name in the app; there is nothing to sign up for.",
      },
      {
        q: "Can several machines use the same topic?",
        a: "Yes. Enter the same topic during setup on each machine. Every notification title names the project, so you can tell runs apart.",
      },
      {
        q: "Can I approve a Codex or Claude Code permission from my phone?",
        a: "Not with anotifier today. The urgent push gets you back to the keyboard fast; the decision itself stays in the terminal.",
      },
    ],
  },
];
