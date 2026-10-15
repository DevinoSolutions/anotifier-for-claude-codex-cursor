import type { Guide } from "./guides";

/**
 * Claude Code deep dives: permission prompts and sounds. Claude Code facts
 * follow its public docs (code.claude.com/docs/en/hooks, hooks-guide and
 * terminal-config); anotifier facts are checked against the package source for
 * the version in lib/site.ts, and say so where the current release falls short.
 */

const osascript = (text: string) =>
  `osascript -e 'display notification "${text}" with title "Claude Code"'`;

const hookEntry = (command: string, matcher?: string) => ({
  ...(matcher === undefined ? {} : { matcher }),
  hooks: [{ type: "command", command }],
});

export const json = (value: unknown) => JSON.stringify(value, null, 2);

export const WINDOWS_SOUND = (file: string) =>
  `powershell.exe -NoProfile -Command "(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\${file}').PlaySync()"`;

export const CLAUDE_GUIDES: Guide[] = [
  {
    slug: "claude-code-permission-notifications",
    updated: "2026-10-08",
    kind: "topic",
    agentSlug: "claude-code",
    name: "Claude Code permissions",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Notification When It Needs Permission or Input",
    description:
      "Add a Notification hook with the permission_prompt matcher to ~/.claude/settings.json; idle_prompt covers waiting for input. The JSON, timing and phone push.",
    h1: "Get notified when Claude Code needs your permission or input",
    intro:
      "Add a `Notification` hook with the matcher `permission_prompt` to `~/.claude/settings.json`. Claude Code runs it when a tool approval has waited about six seconds. The `idle_prompt` matcher covers the other case: Claude finished about a minute ago and you haven't typed since. Below are the exact config, every notification type Claude Code sends, the timing rules, and how to get the alert on your phone.",
    sections: [
      {
        id: "config",
        title: "The config: one hook per notification type",
        blocks: [
          {
            kind: "p",
            text: "This macOS example shows a different banner for an approval and for an idle session. Each matcher gets its own entry under `Notification`:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Notification: [
                  hookEntry(
                    osascript("Claude needs your approval"),
                    "permission_prompt",
                  ),
                  hookEntry(
                    osascript("Claude is waiting for you"),
                    "idle_prompt",
                  ),
                ],
              },
            }),
          },
          {
            kind: "table",
            head: ["Platform", "Command", "Watch out for"],
            rows: [
              [
                "macOS",
                '`osascript -e \'display notification "…" with title "Claude Code"\'`',
                "Banners come from Script Editor. Without its notification permission the command fails silently: run it once, then allow Script Editor in **System Settings > Notifications**",
              ],
              [
                "Linux",
                "`notify-send 'Claude Code' 'Claude needs your approval'`",
                "Needs a desktop notification daemon, which headless servers, SSH sessions and most containers don't have",
              ],
              [
                "Windows",
                "PowerShell, with a module such as BurntToast for a real toast",
                "Claude Code's own example uses a `MessageBox`, a dialog box that can open behind your terminal",
              ],
            ],
          },
          {
            kind: "p",
            text: "Type `/hooks` in Claude Code and select `Notification` to confirm the hooks are registered. Leave the matcher empty, or leave it out, and one hook runs for every notification type.",
          },
        ],
      },
      {
        id: "types",
        title: "Every notification type Claude Code sends",
        blocks: [
          {
            kind: "table",
            head: ["Matcher", "Fires when", "Waiting on you?"],
            rows: [
              [
                "`permission_prompt`",
                "A tool approval, or a sandboxed command's network request, has waited about six seconds",
                "Yes",
              ],
              [
                "`idle_prompt`",
                "Claude finished about 60 seconds ago and you haven't typed since",
                "Claude is done; nothing is blocked",
              ],
              [
                "`elicitation_dialog`",
                "An MCP server opened a form and you haven't typed for about six seconds",
                "Yes",
              ],
              [
                "`elicitation_url_dialog`",
                "An MCP server asks you to open a URL and you haven't typed for about six seconds",
                "Yes",
              ],
              [
                "`agent_needs_input`",
                "A background session waits on you while agent view is open (v2.1.198+)",
                "Yes",
              ],
              [
                "`agent_completed`",
                "A background session finished or failed, while agent view is open (v2.1.198+)",
                "No",
              ],
              [
                "`quota_auto_resume_stale`",
                "A usage limit reset while your computer slept, and Claude waits for Enter (v2.1.234+)",
                "Yes",
              ],
              ["`auth_success`", "Authentication completed", "No"],
              [
                "`elicitation_complete`, `elicitation_response`",
                "An MCP elicitation finished, or its response was sent",
                "No",
              ],
              [
                "`quota_auto_resume_fired`, `quota_auto_resume_disabled`",
                "Claude continued after a usage limit, or stopped waiting for one (v2.1.234+)",
                "No",
              ],
            ],
          },
          {
            kind: "p",
            text: "The hook gets the event as JSON on stdin. Besides the common fields (`session_id`, `transcript_path`, `cwd`), a Notification hook receives `message`, an optional `title`, and `notification_type`, so one script can branch on the type instead of using several matchers:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              session_id: "abc123",
              transcript_path: "/Users/you/.claude/projects/…/session.jsonl",
              cwd: "/Users/you/my-app",
              hook_event_name: "Notification",
              message: "Claude needs your permission",
              title: "Permission needed",
              notification_type: "permission_prompt",
            }),
          },
          {
            kind: "note",
            text: "Notification hooks can't approve, block, or change the prompt; they are for side effects such as a banner, a sound, or a push. To answer a permission request from a hook, Claude Code has a separate `PermissionRequest` event (below).",
          },
        ],
      },
      {
        id: "timing",
        title: "Why the alert arrives seconds (or a minute) later",
        blocks: [
          {
            kind: "ul",
            items: [
              "**In a terminal**, `permission_prompt` waits about six seconds after the prompt appears, so a prompt you answer right away never pings you. Each keystroke pushes that timer back.",
              "**In Claude Desktop and the VS Code extension**, which answer permission requests through the Agent SDK, it fires about six seconds after the request and typing does not delay it. Before v2.1.233 it did not fire there at all. Set `CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS=1` to turn it off in those hosts.",
              "**`idle_prompt`** comes about 60 seconds after Claude finishes, and only if you haven't typed. It is not sent while Claude waits for a usage limit to reset.",
              "**For an alert the moment Claude finishes**, use the `Stop` hook, not `idle_prompt`. See the [Claude Code notifications guide](/guides/claude-code-notifications/).",
              "**For a signal the instant Claude asks for permission**, use a `PermissionRequest` hook. It runs before the prompt is shown and can return a decision (`allow` or `deny`); in an interactive session, a hook that returns no decision leaves the normal prompt in place.",
            ],
          },
        ],
      },
      {
        id: "phone",
        title: "Send approvals to your phone",
        blocks: [
          {
            kind: "p",
            text: "Away from the desk, a banner doesn't help. [ntfy](https://ntfy.sh) is a free push service with Android and iOS apps and no account: subscribe to a topic name only you know, then POST to it from the hook. An urgent priority makes the push stand out:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Notification: [
                  hookEntry(
                    "curl -s -H 'Title: Claude Code' -H 'Priority: urgent' -H 'Tags: warning' -d 'Claude needs your approval' https://ntfy.sh/your-secret-topic",
                    "permission_prompt",
                  ),
                ],
              },
            }),
          },
          {
            kind: "p",
            text: "Anyone who knows a public ntfy.sh topic can read it, so send generic text only. The [ntfy guide](/guides/ntfy-phone-notifications/) covers private topics and self-hosting.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "What anotifier does with these",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "Setup registers one `Notification` hook with an empty matcher, plus a `Stop` hook, in `~/.claude/settings.json`. Every notification becomes a needs-input alert on your desktop, your phone (if you turn on ntfy), and your webhook, with the project in the title (`my-app · Claude Code`) and, in the toast and webhook, the question Claude asked.",
          },
          {
            kind: "table",
            head: ["Notification", "Priority", "Sound", "ntfy tags"],
            rows: [
              [
                'The idle reminder ("Claude is waiting for your input")',
                "default",
                "`Reminder`",
                "`hourglass_flowing_sand`",
              ],
              [
                "Any other notification",
                "urgent",
                "`Reminder`",
                "`bell`, `warning`",
              ],
            ],
          },
          {
            kind: "p",
            text: "Only the idle reminder is toned down, because nothing is blocked. To pick its level, set `idleReminderPriority` to `min`, `low`, `default`, `high`, or `urgent`:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "events": { "needs_input": { "idleReminderPriority": "low" } } }',
          },
          {
            kind: "note",
            text: 'anotifier 1.4.0 and later route by `notification_type`: `permission_prompt` is urgent ("Needs your permission"); `elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input` and `quota_auto_resume_stale` are urgent; `idle_prompt` gets the idle-reminder level; `agent_completed`, `quota_auto_resume_fired` and `quota_auto_resume_disabled` are a default-priority notice; `auth_success`, `elicitation_response` and `elicitation_complete` send nothing; an unknown type is urgent ("Needs your attention"). anotifier 1.3.1 and earlier did not read `notification_type`, so notifications that don\'t need you, such as `auth_success`, also arrived as urgent needs-input alerts; run `npx anotifier@latest setup` to update. To control this yourself, register your own hooks with the matchers above instead.',
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I get notified when Claude Code asks for permission?",
        a: 'Add a Notification hook with "matcher": "permission_prompt" to ~/.claude/settings.json and give it a command that shows a banner, plays a sound, or sends a push. It runs when the prompt has waited about six seconds.',
      },
      {
        q: "Why does the permission notification take a few seconds?",
        a: "Claude Code waits about six seconds so that prompts you answer straight away never notify you. In a terminal, typing pushes the timer back. For a signal the instant Claude asks, use a PermissionRequest hook.",
      },
      {
        q: "What is the difference between permission_prompt and PermissionRequest?",
        a: "permission_prompt is a Notification type: it fires after about six seconds and can only trigger side effects. PermissionRequest is its own hook event: it runs before the prompt appears and can allow or deny the request. It does not run for a sandboxed command's network request.",
      },
      {
        q: "Why do I get a notification a minute after Claude finishes?",
        a: "That is idle_prompt: Claude Code sends it about 60 seconds after a turn ends if you haven't typed. Use a Stop hook to be told the moment Claude finishes, and leave idle_prompt out of your matchers if you don't want the reminder.",
      },
      {
        q: "Can I approve a permission prompt from my phone?",
        a: "Not with anotifier today: the push gets you back to the keyboard, and you answer in the session. A PermissionRequest hook can return allow or deny, which is what a remote-approval tool would build on.",
      },
    ],
  },
  {
    slug: "claude-code-notification-sound",
    updated: "2026-10-06",
    kind: "topic",
    agentSlug: "claude-code",
    name: "Claude Code sounds",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Notification Sound: Play a Sound When Done",
    description:
      'Set "preferredNotifChannel": "terminal_bell" in ~/.claude/settings.json, or add a Stop hook that plays a sound file with afplay, paplay or PowerShell.',
    h1: "Make Claude Code play a sound when it finishes",
    intro:
      'Two ways, with nothing to install: set `"preferredNotifChannel": "terminal_bell"` in `~/.claude/settings.json` to ring the terminal bell, or add a `Stop` hook that plays a sound file, such as `afplay /System/Library/Sounds/Glass.aiff` on macOS. Give the `Notification` hook a different sound and you can tell "done" from "needs you" by ear.',
    sections: [
      {
        id: "bell",
        title: "Option 1: the terminal bell",
        blocks: [
          {
            kind: "p",
            text: "By default Claude Code sends a desktop notification only in Ghostty, Kitty, and iTerm2. In any other terminal, this setting makes it ring the terminal bell instead when it finishes or waits for you:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "preferredNotifChannel": "terminal_bell" }',
          },
          {
            kind: "ul",
            items: [
              "The sound is your terminal's bell, so it is set, and can be muted, in the terminal's own settings.",
              'Apple Terminal: Claude Code\'s first-run terminal setup turns the audible bell off in your profile. Turn it back on under **Settings > Profiles > Advanced > "Audible bell"**.',
              "Some integrated terminals, including VS Code's, don't sound the bell by default. There, use a hook (below); [anotifier in VS Code](/vscode/) covers the ready-made one.",
              "The bell travels over SSH to the terminal you are sitting at.",
            ],
          },
        ],
      },
      {
        id: "hook",
        title:
          'Option 2: a hook with one sound for "done", another for "needs you"',
        blocks: [
          {
            kind: "p",
            text: "Hooks run alongside Claude Code's built-in notification. `Stop` fires when Claude finishes a turn; `Notification` fires when it needs you. This macOS example plays Glass when Claude is done and Ping when it is waiting:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [hookEntry("afplay /System/Library/Sounds/Glass.aiff")],
                Notification: [
                  hookEntry("afplay /System/Library/Sounds/Ping.aiff"),
                ],
              },
            }),
          },
          {
            kind: "table",
            head: ["Platform", "Command", "Notes"],
            rows: [
              [
                "macOS",
                "`afplay /System/Library/Sounds/Glass.aiff`",
                "The 14 built-in sounds: Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink. `afplay` also plays any `.aiff`, `.mp3`, or `.wav` of your own",
              ],
              [
                "Linux",
                "`paplay /usr/share/sounds/freedesktop/stereo/complete.oga`",
                "Needs PulseAudio or PipeWire and the freedesktop sound theme. `message-new-instant.oga` makes a good needs-you sound",
              ],
              [
                "Windows",
                "`(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\chimes.wav').PlaySync()` in PowerShell",
                "Any `.wav` in `C:\\Windows\\Media`, such as `tada.wav` or `notify.wav`. `PlaySync` waits for the sound to end so PowerShell doesn't exit first",
              ],
            ],
          },
          {
            kind: "p",
            text: "On Windows, the hook calls PowerShell. In `settings.json` the backslashes are escaped:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [hookEntry(WINDOWS_SOUND("chimes.wav"))],
                Notification: [hookEntry(WINDOWS_SOUND("notify.wav"))],
              },
            }),
          },
          {
            kind: "note",
            text: "Claude Code waits for a hook to exit, so keep sounds short. On Windows the wait also includes PowerShell's start-up time. A hook runs on the machine where Claude Code runs: over SSH, `afplay` or `paplay` plays on the remote machine, not your laptop.",
          },
        ],
      },
      {
        id: "matchers",
        title: "Only some notifications",
        blocks: [
          {
            kind: "p",
            text: 'A hook without a matcher plays for every notification type, including ones that don\'t need you. To sound only for approvals, add `"matcher": "permission_prompt"` to the entry. The [permission notifications guide](/guides/claude-code-permission-notifications/) lists every type and when it fires.',
          },
        ],
      },
      {
        id: "anotifier",
        title: "Sounds with anotifier",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "anotifier plays a sound with each desktop toast and rings the terminal bell, with different defaults for finished and needs-you events. Set the sound per event with `toastSound`:",
          },
          {
            kind: "table",
            head: ["Event", "Default", "Windows plays", "macOS plays"],
            rows: [
              ["Task finished", "`IM`", "IM", "Glass"],
              ["Approval or question", "`Reminder`", "Reminder", "Ping"],
            ],
          },
          {
            kind: "ul",
            items: [
              "**Windows** takes the notification sound names `Default`, `IM`, `Mail`, `Reminder`, `SMS`, and `Alarm`.",
              "**macOS** maps those names to built-in sounds (`Mail` to Purr, `SMS` to Tink, `Alarm` to Sosumi), and also accepts any of the 14 built-in names directly.",
              "**Linux** ignores sound names; urgent events are sent at critical urgency instead.",
              "`anotifier config sounds` changes them interactively.",
            ],
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              events: {
                task_complete: { toastSound: "Hero" },
                needs_input: { toastSound: "Sosumi" },
              },
            }),
          },
          {
            kind: "p",
            text: "The terminal bell is on by default. With Claude Code 2.1.141 and newer, it rings through Claude Code's own terminal output, which also works inside tmux and GNU screen. Turn it off for one event with `terminalBellEnabled`, or for all of them with `terminalBell.enabled`:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "events": { "task_complete": { "terminalBellEnabled": false } } }',
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make Claude Code play a sound when it's done?",
        a: 'Set "preferredNotifChannel": "terminal_bell" in ~/.claude/settings.json for the terminal bell, or add a Stop hook that plays a file: afplay /System/Library/Sounds/Glass.aiff on macOS, paplay with a freedesktop sound on Linux, or a PowerShell Media.SoundPlayer on Windows.',
      },
      {
        q: "Why doesn't Claude Code make a sound in Apple Terminal?",
        a: "Claude Code's first-run terminal setup turns off the audible bell in your Apple Terminal profile. Turn it back on under Settings > Profiles > Advanced > Audible bell, or use a Stop hook with afplay.",
      },
      {
        q: "Can I use my own sound file?",
        a: "Yes, with a hook: afplay and paplay play any file you point them at, and Media.SoundPlayer plays any .wav. anotifier's toastSound only takes the system sound names listed above.",
      },
      {
        q: "Does the sound work over SSH?",
        a: "The terminal bell and Claude Code's built-in desktop notification reach your local terminal over SSH. A hook runs on the remote machine, so a sound it plays comes out of the remote machine's speakers.",
      },
    ],
  },
  {
    slug: "claude-code-usage-limit-notifications",
    updated: "2026-10-09",
    kind: "topic",
    agentSlug: "claude-code",
    name: "Claude Code usage limits",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Usage Limit Warning: Get Notified at 70%",
    description:
      "Claude Code gives its statusline your 5-hour and weekly usage. Read rate_limits there to alert at 70/85/95%, or run npx anotifier setup (1.5.0+). Pro and Max.",
    h1: "Get a warning before Claude Code hits its usage limit",
    intro:
      "Claude Code has no setting that warns you before a usage limit. It does pass your 5-hour and weekly usage to your `statusLine` command as `rate_limits` on stdin, and hooks never receive those numbers. So a warning has to live in a statusline script: read `rate_limits.five_hour.used_percentage` and `resets_at`, and send a notification when the percentage crosses a line. Below is a script you can write yourself, then how anotifier 1.5.0 and later does the same at 70%, 85% and 95% for both windows. It works on Claude.ai Pro and Max plans only.",
    sections: [
      {
        id: "diy",
        title: "DIY: a statusline script that reads rate_limits",
        blocks: [
          {
            kind: "p",
            text: "Claude Code runs your `statusLine` command and writes a JSON session object to its stdin. For subscribers it includes a `rate_limits` object with two rolling windows. Each has `used_percentage` (0 to 100) and `resets_at` (Unix epoch seconds):",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              rate_limits: {
                five_hour: { used_percentage: 72.4, resets_at: 1738425600 },
                seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
              },
            }),
          },
          {
            kind: "ul",
            items: [
              "`rate_limits` is present only for Claude.ai Pro and Max subscribers, and only after the first API response of a session. Each window can be missing, so code must cope with absence (behind a Claude apps gateway you get `spend_limit` instead; anotifier doesn't watch it).",
              "Claude Code runs the statusline again after each assistant message, after `/compact`, at session start, and on a few other events. A chat you leave idle does not refresh unless you set `refreshInterval` (seconds) on `statusLine`, which re-runs it on a timer so idle chats are checked too.",
              "A new run cancels one that is still going, so keep the script fast.",
            ],
          },
          {
            kind: "p",
            text: "This Node script prints a short status line and sends an [ntfy](https://ntfy.sh) push when the 5-hour window first crosses 70%, 85% and 95%. It remembers the highest line it has already announced in `~/.claude/.usage-alert.json`, and starts over when `resets_at` moves to a later window. It prints the line first, sends next, and records the line only after the send succeeds, because Claude Code cancels a run that is still going when a new update arrives, and a cancel after the state was written would lose that warning for good. Save it as `~/.claude/usage-line.mjs`:",
          },
          {
            kind: "code",
            lang: "js",
            code: `import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const model = input.model?.display_name ?? "Claude";
const win = input.rate_limits?.five_hour;
if (typeof win?.used_percentage !== "number") {
  process.stdout.write(\`[\${model}]\\n\`);
} else {
  const pct = Math.round(win.used_percentage);
  process.stdout.write(\`[\${model}] 5h: \${pct}%\\n\`); // print first

  const resetsAt = win.resets_at ?? 0;
  const level = [70, 85, 95].filter((t) => pct >= t).pop() ?? 0;
  const file = path.join(os.homedir(), ".claude", ".usage-alert.json");
  let seen = { resetsAt: 0, level: 0 };
  try {
    seen = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  if (resetsAt > seen.resetsAt + 600) seen.level = 0; // a new window began
  if (level > seen.level) {
    const at = new Date(resetsAt * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const res = await fetch("https://ntfy.sh/your-secret-topic", {
      method: "POST",
      headers: {
        Title: \`Claude Code 5-hour limit at \${pct}%\`,
        Priority: level >= 95 ? "urgent" : level >= 85 ? "high" : "default",
      },
      body: \`Resets at \${at}\`,
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    // Record it only after a successful send, so a cancelled run retries.
    if (res?.ok) fs.writeFileSync(file, JSON.stringify({ resetsAt, level }));
  }
}`,
          },
          {
            kind: "p",
            text: "Then point Claude Code at it in `~/.claude/settings.json`:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              statusLine: {
                type: "command",
                command: "node ~/.claude/usage-line.mjs",
              },
            }),
          },
          {
            kind: "note",
            text: "Claude Code runs one statusline command, so this replaces any statusline you already have. Anyone who knows a public ntfy.sh topic can read it, so choose a private name and keep the text generic. The script covers only the 5-hour window; add the same logic for `seven_day` to cover the weekly one. The [ntfy guide](/guides/ntfy-phone-notifications/) covers private topics and self-hosting.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "With anotifier 1.5.0 and later",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "anotifier watches the 5-hour and weekly windows and sends one notification as each crosses 70%, 85% and 95%. The title names the window and the percentage, such as `Claude Code · 5-hour limit at 72%`. The body names the chat, the threshold and the reset time, for example `my-app [1a2b3c4d] crossed 70% of the 5-hour usage limit. Resets 14:30 (in 2h 10m).` The chat is `name (project) [first 8 of session id]` when the session has a name that differs from the project folder, and otherwise `project [id]`, so two chats in one folder stay apart.",
          },
          {
            kind: "table",
            head: ["Threshold", "Priority", "ntfy tag"],
            rows: [
              ["70%", "default", "`hourglass_flowing_sand`"],
              ["85%", "high", "`warning`"],
              ["95%", "urgent", "`rotating_light`"],
            ],
          },
          {
            kind: "ul",
            items: [
              "**One warning per threshold, across all your chats.** Usage belongs to your account, not to a chat. The first chat to see a crossing sends it and the others stay quiet. A jump from 60% straight to 96% sends only the 95% warning. When a window resets, its warnings start over.",
              "**It reaches the channels you have on.** Desktop toast, ntfy push and webhook. It never rings the terminal bell, because a statusline has no terminal of its own.",
              "**Snooze and quiet hours hold warnings back.** While either is active no warning is sent and none is recorded, so a threshold you crossed in that time is announced after it ends, provided you are still over it and a statusline refresh happens.",
              "**Claude.ai Pro and Max only.** On API-key billing Claude Code sends no `rate_limits`, so there is nothing to warn about and nothing is sent.",
            ],
          },
          {
            kind: "p",
            text: "Because only the statusline sees usage, setup points the Claude Code `statusLine` at anotifier's `statusline.mjs`. If you already have a statusline command, setup wraps it: your command still runs with the same input and its output is still the line you see, and `npx anotifier uninstall` puts your original back exactly. With no statusline of your own, anotifier prints a short line such as `Opus · 5h 42% · 7d 12%`. A `statusLine` that is not a `command` is left alone. `anotifier status` shows whether it is wired.",
          },
          {
            kind: "p",
            text: "Change the thresholds or turn the feature off in `~/.anotifier/config.json`. This is the default:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              usageAlerts: { enabled: true, thresholds: [70, 85, 95] },
            }),
          },
          {
            kind: "p",
            text: "Thresholds are percentages above 0 and at most 100, so `[50, 80, 100]` also works. An invalid list is reported and the default applies. Set `enabled` to `false` to stop the checks; the statusline keeps working.",
          },
          {
            kind: "note",
            text: 'Installed as a Claude Code plugin, or skipped setup? Nothing wires the statusline for you. Add it by hand to `~/.claude/settings.json`, pointing at `src/statusline.mjs` inside the installed package (`npm root -g` shows where): `"statusLine": { "type": "command", "command": "node \\"/path/to/anotifier/src/statusline.mjs\\"" }`. To keep a statusline you already have, append `--wrap-b64` and the base64 of your command. `status` and `uninstall` only recognize a hand-wired command whose path contains `anotifier`.',
          },
        ],
      },
      {
        id: "related",
        title: "Related: when the limit is already hit",
        blocks: [
          {
            kind: "p",
            text: "A warning comes before the limit. Claude Code sends its own notification types around it too, such as `quota_auto_resume_stale` when a limit reset while your computer slept and Claude waits for Enter (v2.1.234+). anotifier turns that one into a needs-input alert. The [permission notifications guide](/guides/claude-code-permission-notifications/) lists every type.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Can Claude Code warn me before I hit my usage limit?",
        a: "Not with a setting, but it passes your 5-hour and weekly usage (rate_limits.five_hour.used_percentage and resets_at) to your statusLine command. A script there can send a notification when you cross a percentage. anotifier 1.5.0 and later does this for you at 70%, 85% and 95%.",
      },
      {
        q: "Why can't a hook warn me about usage?",
        a: "Claude Code only gives the usage numbers to the statusline command, never to hooks, so the warning has to be triggered from the statusline.",
      },
      {
        q: "Does this work on an API key or the free plan?",
        a: "No. Claude Code reports rate_limits only for Claude.ai Pro and Max subscribers, so with API-key billing there is nothing to warn about and anotifier sends nothing.",
      },
      {
        q: "Will I get a warning from every chat I have open?",
        a: "No. Usage is account-wide, so anotifier warns once per threshold per window across all chats on the machine. The first chat to see the crossing sends it, and the notification names that chat, as `name (project) [id]` when the session has a different name from its folder, otherwise `project [id]`.",
      },
      {
        q: "Will it replace my existing statusline?",
        a: "No. If you already have a statusline command, setup wraps it: your command still runs with the same input and its output is still shown. npx anotifier uninstall restores the original command exactly.",
      },
      {
        q: "Can I change the thresholds or turn the warnings off?",
        a: 'Yes. Set usageAlerts.thresholds in ~/.anotifier/config.json to your own percentages (above 0, at most 100), or usageAlerts.enabled to false. The default is { "enabled": true, "thresholds": [70, 85, 95] }.',
      },
      {
        q: "Does a warning come through while I am snoozed?",
        a: "No. While you are snoozed or inside quiet hours no warning is sent and none is recorded, so a threshold you crossed in that time is announced once it ends, if you are still over it and the statusline refreshes.",
      },
    ],
  },
  {
    slug: "claude-code-auto-compact-warning",
    updated: "2026-10-10",
    kind: "topic",
    agentSlug: "claude-code",
    name: "Claude Code auto-compact warning",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Auto-Compact Warning: Get Notified at 85%",
    description:
      "Claude Code has no setting that warns before it auto-compacts. Read context_window.total_input_tokens in your statusline, or run npx anotifier setup (1.6.0+).",
    h1: "Get notified before Claude Code auto-compacts your chat",
    intro:
      "Claude Code has no setting that warns you before it auto-compacts a chat. It does pass the chat's context size to your `statusLine` command as `context_window.total_input_tokens` on stdin, while hook input carries no `context_window` field. So a warning has to live in a statusline script: compare that number with the auto-compact window and send a notification when the chat gets close. Below is a script you can write yourself, then how anotifier 1.6.0 and later does it, once per chat at 85% by default. Unlike usage-limit warnings it needs no Claude.ai subscription, so it works on API-key and proxy sessions too.",
    sections: [
      {
        id: "what",
        title: "What auto-compact is, and which window counts",
        blocks: [
          {
            kind: "p",
            text: "When a chat's context fills up, Claude Code summarizes the conversation to free space. That is auto-compact, and `/compact` does the same on demand. It kicks in before the model's full context window is used, at the auto-compact window, which you can change with `/autocompact`. So a percentage measured against the model's full window runs low: Claude Code's own `context_window.used_percentage` is measured against the full window, not the auto-compact window, and anotifier does not use it.",
          },
          {
            kind: "p",
            text: "anotifier works out the auto-compact window in this order, and stops at the first hit:",
          },
          {
            kind: "ul",
            items: [
              "The `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable, clamped to 100,000 to 1,000,000 tokens. It overrides the setting.",
              "The `autoCompactWindow` setting that `/autocompact` writes, clamped the same way. A per-model value (`modelSettings.<model id>.autoCompactWindow`, written by Claude Code 2.1.288 and later) wins over the top-level key in the same file. Files are read in this order: `<project>/.claude/settings.local.json`, `<project>/.claude/settings.json`, then `settings.json` in `$CLAUDE_CONFIG_DIR` (default `~/.claude`).",
              "The model's own window, `context_window.context_window_size`.",
            ],
          },
          {
            kind: "p",
            text: "The result never goes above the model's window. If auto-compact is switched off (`DISABLE_AUTO_COMPACT` or `DISABLE_COMPACT` set to a true value such as `1`, `true`, `yes` or `on`, or `autoCompactEnabled: false` in the first settings file that defines it), nothing will compact and nothing is sent.",
          },
        ],
      },
      {
        id: "diy",
        title: "DIY: a statusline script that reads total_input_tokens",
        blocks: [
          {
            kind: "p",
            text: "Claude Code runs your `statusLine` command and writes a JSON session object to its stdin. These fields matter here:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              session_id: "3f9a1c2e-0000-0000-0000-000000000000",
              model: { display_name: "Opus" },
              context_window: {
                total_input_tokens: 174000,
                context_window_size: 200000,
              },
            }),
          },
          {
            kind: "ul",
            items: [
              "`total_input_tokens` counts input plus cache creation plus cache read tokens, and is 0 before the first API response of a session.",
              "`context_window_size` is the model's full window, not the auto-compact window.",
              "Claude Code runs the statusline again after each assistant message, after `/compact`, at session start, and on a few other events. A new run cancels one that is still going, so keep the script fast.",
            ],
          },
          {
            kind: "p",
            text: "This Node script prints a short status line and sends an [ntfy](https://ntfy.sh) push once per chat when it passes 85% of the auto-compact window. It reads the window from `CLAUDE_CODE_AUTO_COMPACT_WINDOW` when that is set in the statusline's environment, otherwise it uses the model's window, and it never reads the `/autocompact` setting, so if you changed that, lower the 85 or read the setting yourself. It remembers each warned `session_id` in `.context-alert.json` in your Claude config folder (`CLAUDE_CONFIG_DIR`, or `~/.claude`), and records one only after the send succeeds, because a cancelled run would otherwise lose the warning for good. It needs Node 18 or later. Save it as `~/.claude/context-line.mjs`:",
          },
          {
            kind: "code",
            lang: "js",
            code: `import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const model = input.model?.display_name ?? "Claude";
const tokens = input.context_window?.total_input_tokens;
const full = input.context_window?.context_window_size;
if (!(tokens > 0) || !(full > 0) || !input.session_id) {
  process.stdout.write("[" + model + "]\\n");
} else {
  const env = Number.parseInt(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, 10);
  const clamped = Math.min(1000000, Math.max(100000, env));
  const window = Math.min(full, env > 0 ? clamped : full);
  const exact = Math.min(100, (tokens / window) * 100);
  const pct = Math.round(exact);
  process.stdout.write("[" + model + "] ctx " + pct + "%\\n"); // print first

  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const file = path.join(dir, ".context-alert.json");
  let warned = {};
  try {
    warned = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  if (exact >= 85 && !warned[input.session_id]) {
    const res = await fetch("https://ntfy.sh/your-secret-topic", {
      method: "POST",
      headers: { Title: "Claude Code context at " + pct + "%", Priority: "high" },
      body: "Close to auto-compact. Wrap up or run /compact.",
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    // Record it only after a successful send, so a cancelled run retries.
    if (res?.ok) {
      warned[input.session_id] = Date.now();
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(warned));
      } catch {}
    }
  }
}`,
          },
          {
            kind: "p",
            text: "Then point Claude Code at it in `~/.claude/settings.json`:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              statusLine: {
                type: "command",
                command: "node ~/.claude/context-line.mjs",
              },
            }),
          },
          {
            kind: "note",
            text: "Claude Code runs one statusline command, so this replaces any statusline you already have. The script never prunes old session ids from its file, and anyone who knows a public ntfy.sh topic can read it, so choose a private name and keep the text generic. The [ntfy guide](/guides/ntfy-phone-notifications/) covers private topics and self-hosting.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "With anotifier 1.6.0 and later",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "anotifier sends one notification per chat when its context passes 85% of the auto-compact window. The title carries the percentage, such as `Claude Code · context at 87%`, and the body names the chat and the size: `my-app [3f9a1c2e] is at 87% of its auto-compact window (174K of 200K tokens). It will compact soon — wrap up or /compact now.` Priority is high.",
          },
          {
            kind: "ul",
            items: [
              "**Once per chat.** Each `session_id` warns once and never again, even after `/compact` brings its context back down. `/clear` starts a new session, which can warn again. Warned chats are remembered in `~/.anotifier/.context-alerts.json` and forgotten after 14 days.",
              "**It reaches the channels you have on.** Desktop toast, ntfy push and webhook. It never rings the terminal bell, because a statusline has no terminal of its own.",
              "**Snooze and quiet hours hold it back.** While either is active nothing is sent and nothing is recorded, so a chat already over the line is warned once it ends, if a statusline refresh happens.",
              "**No subscription needed.** The context numbers come with every statusline refresh, so API-key and proxy sessions are covered, unlike the usage-limit warnings.",
            ],
          },
          {
            kind: "p",
            text: "It uses the same statusline wiring as the [usage limit warnings](/guides/claude-code-usage-limit-notifications/): setup points the Claude Code `statusLine` at anotifier's `statusline.mjs`, wraps a statusline you already have so it still prints your line, and `npx anotifier uninstall` restores it. `anotifier status` shows whether the context warning is on and its threshold.",
          },
          {
            kind: "p",
            text: "Change the threshold or turn the warning off in `~/.anotifier/config.json`. This is the default:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({ contextAlerts: { enabled: true, threshold: 85 } }),
          },
          {
            kind: "p",
            text: "`threshold` is a percentage above 0 and at most 100. An invalid value is reported and 85 applies. Set `enabled` to `false` to stop the checks; the statusline and the usage warnings keep working.",
          },
          {
            kind: "note",
            text: 'Installed as a Claude Code plugin, or skipped setup? Nothing wires the statusline for you. Add it by hand to `~/.claude/settings.json`, pointing at `src/statusline.mjs` inside the installed package (`npm root -g` shows where): `"statusLine": { "type": "command", "command": "node \\"/path/to/anotifier/src/statusline.mjs\\"" }`.',
          },
        ],
      },
      {
        id: "limits",
        title: "Limits worth knowing",
        blocks: [
          {
            kind: "ul",
            items: [
              "**Some settings are invisible to a statusline.** The `--autocompact` command-line flag and managed (enterprise) settings never reach it, so with either in play the warning can come late or not at all.",
              "**An idle chat is not checked.** The statusline runs on Claude Code's own events, so a chat you leave alone does not warn until it next refreshes, unless you set `refreshInterval` on `statusLine`.",
              "**One warning, not a countdown.** After the warning a chat is never warned again, even if you keep working past it.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Can Claude Code warn me before it auto-compacts?",
        a: "Not with a setting, but it passes the chat's context size (context_window.total_input_tokens) to your statusLine command. A script there can send a notification when it nears the auto-compact window. anotifier 1.6.0 and later does this for you, once per chat at 85%.",
      },
      {
        q: "Why can't a hook warn me about context?",
        a: "Claude Code passes the context_window numbers to the statusline command, and hook input has no context_window field, so the warning is triggered from the statusline.",
      },
      {
        q: "Does this need a Claude.ai Pro or Max plan?",
        a: "No. Unlike the usage-limit warning, the context numbers come with every statusline refresh, so API-key and proxy sessions get the warning too.",
      },
      {
        q: "Does it follow my /autocompact setting?",
        a: "Yes. anotifier uses the CLAUDE_CODE_AUTO_COMPACT_WINDOW environment variable first, then the autoCompactWindow setting from your project and user settings files, then the model's window, and never goes above the model's window. The --autocompact flag and managed settings are invisible to a statusline, so with those the warning can be late or missing.",
      },
      {
        q: "Will it warn again after I run /compact?",
        a: "No. Each chat warns once and never again, even after /compact. /clear starts a new session, which can warn again.",
      },
      {
        q: "Can I change the threshold or turn the warning off?",
        a: 'Yes. Set contextAlerts.threshold in ~/.anotifier/config.json to a percentage above 0 and at most 100, or contextAlerts.enabled to false. The default is { "enabled": true, "threshold": 85 }.',
      },
      {
        q: "Does a warning come through while I am snoozed?",
        a: "No. While you are snoozed or inside quiet hours nothing is sent and nothing is recorded, so a chat already over the line is warned once that ends, if the statusline refreshes.",
      },
    ],
  },
  {
    slug: "claude-code-hooks-security",
    updated: "2026-10-11",
    kind: "topic",
    agentSlug: "claude-code",
    name: "Claude Code hooks security",
    icon: "/assets/icons/claude.png",
    title: "Claude Code Hooks Security: What Runs and How to Audit It",
    description:
      "Claude Code hooks run shell commands with your full user permissions. See where they come from, how to audit them with /hooks, and how to lock them down.",
    h1: "Claude Code hooks security: what hooks can run and how to audit them",
    intro:
      "A Claude Code hook is a shell command that runs with your full user permissions. Anyone who can put one in a settings file, a plugin or a repository you trust can run code as you. Hooks come from your user, project and local settings files, from plugins, from skill and subagent frontmatter, and from managed policy. Type `/hooks` to see every active hook and where it came from. Set `disableAllHooks` to switch them all off, and an admin can set `allowManagedHooksOnly` to block everything except managed hooks. Codex CLI, Gemini CLI and Cursor work the same way, each with its own review step. The last section lists exactly what anotifier's own hooks do.",
    sections: [
      {
        id: "what",
        title: "What a hook is allowed to run",
        blocks: [
          {
            kind: "p",
            text: "A Claude Code `command` hook runs a shell command and passes it the event as JSON on stdin. The [Claude Code docs](https://code.claude.com/docs/en/hooks#security-considerations) put it plainly: command hooks execute shell commands with your full user permissions, and can modify, delete or access any file your user account can. A hook process also inherits Claude Code's environment, apart from the `OTEL_*` exporter variables and, when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is set to `1`, the variables Claude Code strips. So an API key exported in your shell is visible to every hook.",
          },
          {
            kind: "ul",
            items: [
              "**What it receives.** Every event carries `session_id`, `transcript_path` and `cwd`. Tool events add the tool name and its input, so a `PreToolUse` hook sees the command or file path Claude is about to use.",
              "**What it can change.** A hook can do more than watch. A `PreToolUse` hook can deny a tool call or rewrite its input, so a hook can change what Claude does as well as read it.",
              "**Other handler types.** Besides `command`, a hook can be `http` (the event JSON is sent as a POST request to a URL), `mcp_tool`, `prompt` or `agent`.",
            ],
          },
        ],
      },
      {
        id: "where",
        title: "Where Claude Code hooks come from",
        blocks: [
          {
            kind: "table",
            head: ["Location", "Applies to", "Shared with others"],
            rows: [
              ["`~/.claude/settings.json`", "All your projects", "No"],
              [
                "`.claude/settings.json`",
                "One project",
                "Yes, it can be committed to the repo",
              ],
              [
                "`.claude/settings.local.json`",
                "One project",
                "No, gitignored when Claude Code saves a setting to it",
              ],
              [
                "Managed policy settings",
                "The whole organization",
                "Yes, set by an admin",
              ],
              [
                "A plugin's `hooks/hooks.json`",
                "While the plugin is enabled",
                "Yes, bundled with the plugin",
              ],
              [
                "Skill frontmatter",
                "The rest of the session once the skill is invoked",
                "Yes, defined in the skill file",
              ],
              [
                "Subagent frontmatter",
                "While that subagent is running",
                "Yes, defined in the subagent file",
              ],
            ],
          },
          {
            kind: "p",
            text: "Entries add up. User, project and local hooks are merged rather than replacing each other, and none of them can remove a managed hook. Hooks from settings files, managed policy and plugins also run inside subagents.",
          },
        ],
      },
      {
        id: "risks",
        title: "The real risks",
        blocks: [
          {
            kind: "ul",
            items: [
              "**A repository you cloned.** A project's `.claude/settings.json` can hold hooks and is meant to be committed. In an interactive session, Claude Code holds back hooks from every settings file until you accept the workspace trust dialog for the folder, or for a parent folder whose trust extends to it. Once you accept, the repository's hooks run. In a `claude -p` or SDK session no dialog ever appears and the folder counts as trusted, so the repository's hooks run straight away.",
              "**Hooks that change under you.** Claude Code picks up edits to hooks in settings files automatically. After a `git pull` in a repository you already trust, read the diff of `.claude/` as well as the code.",
              "**Plugins.** An enabled plugin's hooks run with the same permissions as hooks you wrote yourself. Read a plugin's `hooks/hooks.json` before you enable it.",
              "**Secrets.** A hook sees your whole environment, the session's `transcript_path` and the inputs of tool calls. A command can hand any of that to another program. Claude Code's own advice for hook authors includes skipping sensitive files such as `.env`, `.git/` and keys.",
              "**Network exfiltration.** A command hook is an ordinary command, so it can make network requests. An `http` hook posts the event JSON to the URL it names. Two settings narrow the second kind: `allowedHttpHookUrls` limits which URLs an HTTP hook may call, and `httpHookAllowedEnvVars` limits which environment variables go into hook headers.",
            ],
          },
        ],
      },
      {
        id: "audit",
        title: "How to audit the hooks you have",
        blocks: [
          {
            kind: "ol",
            items: [
              "**List them.** Type `/hooks` in Claude Code. It is a read-only browser. It labels each hook with where it comes from (user settings, project settings, local settings, a plugin or the current session) and shows the full text of what it runs.",
              "**Read the files.** Open `~/.claude/settings.json`, then `.claude/settings.json` and `.claude/settings.local.json` in each project, then the `hooks/hooks.json` of each enabled plugin. To remove a hook, delete its entry. Claude Code has no way to disable one hook and keep it in the config.",
              "**Switch them all off while you look.** Set `disableAllHooks` to `true` in a settings file. It also turns off a custom status line and a custom file suggestion command.",
            ],
          },
          {
            kind: "code",
            lang: "json",
            code: json({ disableAllHooks: true }),
          },
          {
            kind: "p",
            text: 'Claude Code reads the value left after settings precedence, so a project\'s `.claude/settings.json` that sets `"disableAllHooks": false` overrides a `true` in your user settings. To turn hooks off for one run whatever the project says, pass the setting on the command line, which takes precedence over project and local settings:',
          },
          {
            kind: "code",
            lang: "bash",
            code: `claude --settings '{"disableAllHooks": true}'`,
          },
        ],
      },
      {
        id: "lockdown",
        title: "How to lock hooks down",
        blocks: [
          {
            kind: "p",
            text: "For code you didn't write, the [permissions docs](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder) suggest three options before you run `claude -p` there. Each stops the project's own hooks from running:",
          },
          {
            kind: "code",
            lang: "bash",
            code: [
              "# read only your user settings, not the project's",
              'claude -p --setting-sources user "your prompt"',
              "# read no hooks, skills, commands, subagents, plugins or .mcp.json servers from the project",
              'claude -p --bare "your prompt"',
              "# turn hooks off for this run",
              `claude -p --settings '{"disableAllHooks": true}' "your prompt"`,
            ].join("\n"),
          },
          {
            kind: "p",
            text: "Setting `disableAllHooks` in your user settings alone is not enough here, because the project's settings take precedence over yours.",
          },
          {
            kind: "p",
            text: "For a team, an admin sets `allowManagedHooksOnly` in [managed settings](https://code.claude.com/docs/en/managed-settings):",
          },
          {
            kind: "code",
            lang: "json",
            code: json({ allowManagedHooksOnly: true }),
          },
          {
            kind: "ul",
            items: [
              "**Still runs:** hooks from managed settings, hooks the Agent SDK registers in process, and hooks from plugins your managed settings force-enable through `enabledPlugins`.",
              "**Blocked:** user, project and local hooks, hooks from other installed plugins, and hooks declared in agent frontmatter.",
              "**Also narrowed:** `statusLine`, `fileSuggestion` and `subagentStatusLine` are read from managed settings only.",
              "**Cannot be undone from below:** only `disableAllHooks` set at the managed level can disable managed hooks.",
            ],
          },
          {
            kind: "p",
            text: "The [setting's reference entry](https://code.claude.com/docs/en/settings-reference#allowmanagedhooksonly) lists the rest, including how command-sourced plugins are treated.",
          },
        ],
      },
      {
        id: "sdk",
        title: "Claude Agent SDK hooks",
        blocks: [
          {
            kind: "p",
            text: "The Agent SDK has hooks of its own: callback functions you register in your code with `options.hooks`, which run in your process. When the SDK collects the hooks for an event, it also includes shell command hooks from settings files, if the matching `settingSources` (TypeScript) or `setting_sources` (Python) entry is enabled. The [SDK hooks docs](https://code.claude.com/docs/en/agent-sdk/hooks) say it is enabled for default `query()` options. So an SDK agent started in a folder can run that folder's project hooks.",
          },
          {
            kind: "p",
            text: "When the folder isn't yours, set `settingSources` without project settings. Under `allowManagedHooksOnly`, hooks the SDK registers in process still run, and user, project and local settings hooks do not.",
          },
        ],
      },
      {
        id: "others",
        title: "Codex CLI, Gemini CLI and Cursor",
        blocks: [
          {
            kind: "ul",
            items: [
              "**Codex CLI.** Hooks live in `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json` and `<repo>/.codex/config.toml`, in plugins, and in managed `requirements.toml`. Before a non-managed hook runs, Codex requires you to review and trust the exact hook definition. It records trust against the hook's hash, so new or changed hooks are skipped until you trust them. Run `/hooks` to inspect sources, trust hooks or disable individual non-managed hooks. Project hooks load only when the project's `.codex/` layer is trusted. To turn hooks off, set `hooks = false` under `[features]` in `config.toml`. Admins can set `allow_managed_hooks_only = true` to ignore user, project, session and plugin hooks. The docs also say to treat tool hooks as a guardrail, not a complete enforcement boundary.",
              "**Gemini CLI.** Hooks live in `settings.json`: `.gemini/settings.json` in the project, `~/.gemini/settings.json`, `/etc/gemini-cli/settings.json`, and installed extensions. The docs say hooks execute arbitrary code with your user privileges and that project-level hooks are particularly risky in untrusted projects. Gemini CLI fingerprints project hooks. If a hook's name or command changes, for example after a `git pull`, it is treated as a new, untrusted hook and you are warned before it runs. `/hooks panel` lists them, `/hooks disable-all` turns them all off and `/hooks disable <name>` turns one off. Hooks run with a sanitized environment.",
              "**Cursor.** Hooks live in `.cursor/hooks.json` in a project and `~/.cursor/hooks.json` for you. Enterprise installs add a system-wide `hooks.json` (`/Library/Application Support/Cursor/` on macOS, `/etc/cursor/` on Linux and WSL, `C:\\ProgramData\\Cursor\\` on Windows), and Enterprise teams can sync hooks from the web dashboard. Project hooks run in any trusted workspace. The Hooks tab in Customize and the Hooks output channel show what is configured and what ran. Cursor reloads `hooks.json` when you save it, so removing an entry is how you stop a hook.",
            ],
          },
        ],
      },
      {
        id: "anotifier",
        title: "What anotifier's own hooks do",
        blocks: [
          {
            kind: "p",
            text: "anotifier is a set of hooks, so it should pass the same audit. This section follows the source of anotifier 1.7.1: [src/notify.mjs](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/blob/main/src/notify.mjs) and [setup/patch-config.mjs](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/blob/main/setup/patch-config.mjs). `npx anotifier setup` edits your user-level files only, never a project's settings:",
          },
          {
            kind: "table",
            head: ["Agent", "File setup edits", "Events it registers"],
            rows: [
              [
                "Claude Code",
                "`~/.claude/settings.json`",
                "`Notification`, `Stop`, and the `statusLine` command",
              ],
              [
                "Codex CLI",
                "`~/.codex/hooks.json` and `~/.codex/config.toml`",
                "`Stop`, `SessionStart`, `PermissionRequest`",
              ],
              ["Cursor", "`~/.cursor/hooks.json`", "`stop`"],
              [
                "Gemini CLI",
                "`~/.gemini/settings.json`",
                "`AfterAgent`, `Notification`",
              ],
              ["Antigravity CLI", "`~/.gemini/config/hooks.json`", "`Stop`"],
            ],
          },
          {
            kind: "p",
            text: 'Every entry runs `node "<path>/src/notify.mjs" --source <agent>`, a local script in the anotifier package. For Claude Code, setup also points `statusLine` at `src/statusline.mjs`, which drives the usage and context warnings. If you already had a statusline, anotifier wraps it and still prints your line. `disableAllHooks` switches this statusline off too. Installed as a Claude Code plugin instead, the same `Notification` and `Stop` hooks come from the plugin\'s `hooks/hooks.json`.',
          },
          {
            kind: "p",
            text: "For Codex, setup also sets `hooks = true` in `config.toml` and writes the `trusted_hash` of each of its own hooks, so Codex does not ask you to review them. If you edit one by hand, Codex skips it until you trust it again in `/hooks`.",
          },
          {
            kind: "p",
            text: "When a hook fires, `notify.mjs` does this:",
          },
          {
            kind: "ul",
            items: [
              "Reads the event JSON from stdin and your settings from `~/.anotifier/config.json`.",
              "For Claude Code, it can read the session transcript so a toast or webhook shows Claude's last message. That is the `richContent` setting: on for toast and webhook, off for ntfy. Other agents get generic text.",
              "Shows a desktop toast by running a local program: PowerShell 7 with BurntToast on Windows, `osascript` on macOS, `notify-send` on Linux, and PowerShell through Windows interop on WSL.",
              "Writes small lock files and an `errors.log` under `~/.anotifier/`, and always exits 0 so it can't fail your agent's turn.",
            ],
          },
          {
            kind: "p",
            text: "The only network calls come from these channels. Each one is off unless you turned it on, except the version check:",
          },
          {
            kind: "table",
            head: ["Destination", "When", "What is sent", "Turn it off"],
            rows: [
              [
                "Your ntfy server (default `https://ntfy.sh`)",
                "ntfy enabled with a topic",
                "The notification title and text. Claude's last message only with `ntfy.richContent`",
                "`ntfy.enabled: false`",
              ],
              [
                "Your webhook URL",
                "Webhook enabled with a URL",
                "JSON with title, message, source, project, event and timestamp in the generic format. For Claude Code the message is Claude's last message unless `webhook.richContent` is false",
                "`webhook.enabled: false`",
              ],
              [
                "Your Sentry DSN",
                "`sentry.enabled` with a `sentry.dsn`",
                "Hook and channel errors",
                "`sentry.enabled: false`",
              ],
              [
                "`posthog.devino.ca`",
                "You opted in to usage stats. At most once a day from hooks",
                "Counts and which features are on. Never message text, project names, paths, topics or URLs",
                "`anotifier telemetry off`, or `DO_NOT_TRACK=1`",
              ],
              [
                "`registry.npmjs.org`",
                "At most once every 24 hours",
                "A plain request for the latest `anotifier` version",
                "`updateCheck.enabled: false` stops the hook's check",
              ],
            ],
          },
          {
            kind: "p",
            text: "Setup itself downloads the notification icon from `claude.ai` once and, on Windows, installs the BurntToast PowerShell module for your user. Apart from the calls above, the hook path makes no network calls of its own. The README lists every usage-stats field.",
          },
          {
            kind: "p",
            text: "To inspect and remove it:",
          },
          {
            kind: "code",
            lang: "bash",
            code: [
              "npx anotifier@latest status     # which agents are wired, and with which events",
              "npx anotifier@latest telemetry  # usage stats on or off, and what is waiting to be sent",
              "npx anotifier@latest uninstall  # remove anotifier's hooks from every agent",
            ].join("\n"),
          },
          {
            kind: "ul",
            items: [
              "`uninstall` asks first, backs up each file to `~/.anotifier/backups/`, and removes only anotifier's entries, its Codex trust hashes and its statusline wrapper, which restores your own statusline. It keeps `~/.anotifier/`, so delete that folder by hand if you want it gone. On Windows it also removes the `agentfocus://` click-to-focus protocol that the first toast registers.",
              "A plugin install is separate: remove it from Claude Code's `/plugin` menu. `uninstall` doesn't touch it.",
              "`/hooks` in Claude Code and Codex, `/hooks panel` in Gemini CLI, and the Hooks tab in Cursor show the entries too.",
            ],
          },
        ],
      },
      {
        id: "sources",
        title: "Official docs this page follows",
        blocks: [
          {
            kind: "p",
            text: "Checked on 2026-10-11. Docs change, so confirm a setting there before you rely on it.",
          },
          {
            kind: "ul",
            items: [
              "Claude Code: [hooks reference](https://code.claude.com/docs/en/hooks), [permissions and workspace trust](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder), [`allowManagedHooksOnly` and `disableAllHooks`](https://code.claude.com/docs/en/settings-reference#allowmanagedhooksonly), [managed settings](https://code.claude.com/docs/en/managed-settings)",
              "Claude Agent SDK: [hooks](https://code.claude.com/docs/en/agent-sdk/hooks)",
              "Codex CLI: [hooks](https://learn.chatgpt.com/docs/hooks)",
              "Gemini CLI: [hooks](https://geminicli.com/docs/hooks/)",
              "Cursor: [hooks](https://cursor.com/docs/hooks)",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Can a Claude Code hook run any command?",
        a: "Yes. A command hook runs a shell command with your full user permissions, so it can read, change or delete anything your user account can, and it can make network requests. Claude Code's docs say to review and test every hook command before you add it.",
      },
      {
        q: "Does Claude Code run hooks from a repository I just cloned?",
        a: "Only after you accept the workspace trust dialog in an interactive session. Until then Claude Code holds back hooks from every settings file. In a claude -p or SDK session there is no dialog and the folder counts as trusted, so the repository's hooks run right away. Use --setting-sources user, --bare or --settings with disableAllHooks set to true for code you didn't write.",
      },
      {
        q: "How do I see which hooks are active in Claude Code?",
        a: "Type /hooks. It is a read-only browser that labels each hook with its source (user, project or local settings, a plugin, or the session) and shows the full text of what it runs.",
      },
      {
        q: "How do I turn off all Claude Code hooks?",
        a: 'Set disableAllHooks to true in a settings file, or pass --settings with {"disableAllHooks": true} for one run. A project\'s settings take precedence over your user settings, so the flag is the reliable way for a single run. Only the managed settings level can disable managed hooks.',
      },
      {
        q: "What does allowManagedHooksOnly do?",
        a: "It is a managed-settings key. When true, only managed hooks run, plus hooks the Agent SDK registers in process and hooks from plugins that managed settings force-enable. User, project and local hooks and other plugins' hooks are blocked.",
      },
      {
        q: "Do Codex CLI, Gemini CLI and Cursor review hooks before running them?",
        a: "Codex skips new or changed non-managed hooks until you trust them, and loads project hooks only for a trusted project. Gemini CLI fingerprints project hooks and warns before a changed one runs. Cursor runs project hooks in a trusted workspace.",
      },
      {
        q: "Is anotifier's hook safe to run?",
        a: "It is a local Node script you can read. It runs with your permissions like any hook, sends notifications only to the channels you turned on (ntfy, a webhook, and Sentry if you set a DSN), and makes a version check against the npm registry at most once a day. Usage stats are off unless you opt in. Run npx anotifier status to see what is wired and npx anotifier uninstall to remove it.",
      },
    ],
  },
  {
    slug: "ccnotify",
    updated: "2026-10-12",
    kind: "topic",
    agentSlug: "claude-code",
    name: "ccnotify",
    icon: "/assets/icons/claude.png",
    title: "ccnotify for Claude Code: Which One Is Which?",
    description:
      "Several Claude Code tools are named ccnotify: a macOS script, an npm hook builder, a talking PyPI package and tray apps. What each does and how to tell yours.",
    h1: "ccnotify for Claude Code: which one is which?",
    intro:
      "There is no single ccnotify. At least seven unrelated open-source projects use the name, and all of them send Claude Code notifications. The best known, [dazuiba/CCNotify](https://github.com/dazuiba/CCNotify), is a macOS-only Python script built on terminal-notifier. The `ccnotify` package on npm is a different tool that writes Stop hooks for Discord, ntfy and macOS. The `ccnotify` package on PyPI is a third, and it speaks its notifications aloud. Four newer projects are a Rust binary for Windows, macOS and Linux, a Go command line tool for macOS, and two tray or menu-bar apps. To find yours, look at the ccnotify entry in `~/.claude/settings.json` and match it against the table below. anotifier is a separate project and none of these; the comparison further down says where each of them does something anotifier doesn't.",
    sections: [
      {
        id: "which",
        title: "Which projects are called ccnotify?",
        blocks: [
          {
            kind: "p",
            text: "Everything below comes from each project's own README, source or registry page, read on 2026-10-12 (links in the last section). Star counts and dates are from that day.",
          },
          {
            kind: "table",
            head: [
              "Project",
              "What it does",
              "How it installs",
              "Claude Code hooks it uses",
              "Last activity",
            ],
            rows: [
              [
                "[dazuiba/CCNotify](https://github.com/dazuiba/CCNotify) (216 stars, MIT)",
                "macOS desktop notifications when Claude finishes or needs input, including how long the task took. Clicking one opens the project in VS Code. macOS only.",
                "By hand: put `ccnotify.py` in `~/.claude/ccnotify/`, run `brew install terminal-notifier`, add three hooks to `settings.json`",
                "`UserPromptSubmit`, `Stop`, `Notification`",
                "Last commit 2025-10-14",
              ],
              [
                "[foxytanuki/ccnotify](https://github.com/foxytanuki/ccnotify) (npm `ccnotify`, MIT)",
                "A command line tool that writes a Claude Code `Stop` hook for you, in three flavors: a Discord webhook, an ntfy topic, or a macOS notification. The shell scripts it generates read the session transcript, so the message carries your prompt and Claude's reply.",
                "`npx ccnotify discord <webhook-url>`, `npx ccnotify ntfy <topic>` or `npx ccnotify macos`, or `npm install -g ccnotify`",
                "`Stop`",
                "npm 0.1.1, 2025-07-31",
              ],
              [
                "[Helmi/CCNotify](https://github.com/Helmi/CCNotify) (PyPI `ccnotify`, MIT)",
                "Spoken notifications. Text-to-speech, either local Kokoro models (about 350 MB) or ElevenLabs, says when your input is needed, when a task is done, and when a risky command or an error comes up. Its README says it is tested on macOS only.",
                "`uvx ccnotify install`",
                "`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `Notification`",
                "PyPI 0.1.13, 2025-08-10; last commit 2026-02-16",
              ],
              [
                "[MoYeRanqianzhi/CCNotify](https://github.com/MoYeRanqianzhi/CCNotify) (Rust, MIT)",
                "A small binary that shows a native notification with a sound when Claude finishes: a toast on Windows, `osascript` on macOS, `notify-send` on Linux. A second build plays a custom audio file.",
                "Download a binary from its releases, or `cargo build --release`",
                "`Stop`",
                "v0.2.0, 2026-04-25",
              ],
              [
                "[tez-Szymon/CCNotify](https://github.com/tez-Szymon/CCNotify)",
                "A tray app for macOS 13+ and Windows 10/11, with WSL support. A clickable banner appears when a session needs attention, and clicking it returns you to the terminal. Optional iPhone alerts through an installable web app and a relay at ccnotify.pl.",
                "Build from source, or a Windows installer from its releases; then use Install Hook in the tray menu or `--install-hook`",
                "`permission_prompt` and `idle_prompt` handlers (the `Notification` event)",
                "v0.2.0, 2026-07-01",
              ],
              [
                "[daniil4545/ccnotify](https://github.com/daniil4545/ccnotify) (Go, MIT)",
                "macOS notifications that name the project and the event, grouped per session, with cooldowns so it doesn't repeat itself. Clicking one raises the window that holds the project. A `ccnotify doctor` command checks the setup.",
                "`go install github.com/daniil4545/ccnotify/cmd/ccnotify@latest`, `brew install terminal-notifier`, then `ccnotify init`",
                "`Stop`, `Notification`",
                "v0.1.0, 2026-09-02",
              ],
              [
                "[dmxj/ccnotify](https://github.com/dmxj/ccnotify) (Swift, MIT)",
                "A macOS 13+ menu-bar app for Claude Code and Codex CLI. Approval cards let you Allow, Deny or allow for the session without going back to the terminal, and `AskUserQuestion` prompts become buttons. The app's interface is in Chinese. It listens on 127.0.0.1 only.",
                "A `.pkg` from its releases (not Apple-signed, so right-click, Open the first time), or `./build.sh`",
                "Claude Code: `PermissionRequest`, `PreToolUse` (only `AskUserQuestion`), `Notification`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`",
                "v0.3.0, 2026-09-01",
              ],
            ],
          },
          {
            kind: "p",
            text: "[ningjiaen123/CCNotify-Windows](https://github.com/ningjiaen123/CCNotify-Windows) is a Windows port of dazuiba's script that uses the winotify Python package. Searching GitHub for the name turns up more repositories, mostly with no stars and no description; this page covers the ones with a README that says what they do.",
          },
        ],
      },
      {
        id: "identify",
        title: "How do I tell which ccnotify I have?",
        blocks: [
          {
            kind: "p",
            text: "Search the files Claude Code reads hooks from for the word `ccnotify`. Check `~/.claude/settings.json`, and in a project `.claude/settings.json` and `.claude/settings.local.json`; foxytanuki's tool writes to the local file by default. Inside Claude Code, `/hooks` lists every active hook and where it came from.",
          },
          {
            kind: "code",
            lang: "bash",
            code: [
              "# macOS, Linux, WSL, Git Bash",
              "grep -n ccnotify ~/.claude/settings.json",
              "",
              "# Windows PowerShell",
              'Select-String -Path "$HOME\\.claude\\settings.json" -Pattern ccnotify',
              "",
              "# Installed as a package?",
              "npm ls -g ccnotify",
              "pip show ccnotify",
            ].join("\n"),
          },
          {
            kind: "table",
            head: ["What you find", "Which project"],
            rows: [
              [
                "`~/.claude/ccnotify/ccnotify.py` followed by an event name (`Stop`, `Notification`, `UserPromptSubmit`), and `ccnotify.db` and `ccnotify.log` in that folder",
                "dazuiba/CCNotify (or the Windows port, which runs it with `python`)",
              ],
              [
                "`uv run …/ccnotify.py` with no event name, on five events, and a `config.json` in `~/.claude/ccnotify/`",
                "Helmi/CCNotify, the PyPI package",
              ],
              [
                "A `Stop` entry whose matcher is `discord-notification`, `ntfy-notification` or `macos-notification`, pointing at a `.sh` script under `~/.local/share/ccnotify/` by default",
                "foxytanuki/ccnotify, the npm package",
              ],
              [
                "A `ccnotify` executable, usually with `-t`, `-b` or `-s` options, on `Stop`",
                "MoYeRanqianzhi/CCNotify",
              ],
              [
                "`permission_prompt` and `idle_prompt` handlers that run `CCNotify.app` or `CCNotify.exe`, and a `settings.json.ccnotify-backup` file next to your settings",
                "tez-Szymon/CCNotify",
              ],
              [
                "A `~/.config/ccnotify/config.json` file, and `ccnotify doctor` works in a terminal",
                "daniil4545/ccnotify",
              ],
              [
                "A `~/.ccnotify/` folder holding `ccnotify-hook`, entries that mention `ccnotify-hook`, and a bell icon in the menu bar",
                "dmxj/ccnotify",
              ],
            ],
          },
          {
            kind: "p",
            text: "dazuiba's and Helmi's tools both keep a script at `~/.claude/ccnotify/ccnotify.py`, so installing one overwrites the other's file. The hook command tells them apart: Helmi's starts with `uv run` and passes no event name, dazuiba's ends with the event name.",
          },
        ],
      },
      {
        id: "compare",
        title: "How do the ccnotify tools compare with anotifier?",
        blocks: [
          {
            kind: "p",
            text: "A dash means the project's README doesn't mention it, which isn't proof it can't. The anotifier row follows the code and [docs](/docs/) for version 1.7.1.",
          },
          {
            kind: "table",
            head: [
              "Tool",
              "Agents",
              "OS",
              "Channels",
              "Phone push",
              "Sound",
              "Click to focus",
              "Approve from the notification",
            ],
            rows: [
              [
                "anotifier",
                "Claude Code, Codex CLI, Cursor, Gemini CLI, Antigravity CLI",
                "Windows, macOS, Linux, WSL",
                "Desktop toast, ntfy, Slack, Discord, Telegram or generic webhook, terminal bell",
                "Yes, through ntfy (Android and iOS)",
                "Per-event toast sounds (Windows names, mapped on macOS), terminal bell",
                "Windows only",
                "No, not in a release",
              ],
              [
                "dazuiba/CCNotify",
                "Claude Code",
                "macOS",
                "Desktop (terminal-notifier)",
                "—",
                "System default sound",
                "Opens the project in VS Code",
                "—",
              ],
              [
                "foxytanuki/ccnotify",
                "Claude Code",
                "macOS, Linux and Windows per its README; the hooks are bash scripts that need `jq` and `curl`",
                "Discord webhook, ntfy (public ntfy.sh), macOS notification",
                "Yes, through ntfy.sh",
                "macOS: system sound",
                "—",
                "—",
              ],
              [
                "Helmi/CCNotify",
                "Claude Code",
                "Tested on macOS; the package metadata also lists Linux",
                "Desktop notification, spoken audio (Kokoro or ElevenLabs)",
                "—",
                "Spoken messages",
                "—",
                "—",
              ],
              [
                "MoYeRanqianzhi/CCNotify",
                "Claude Code",
                "Windows 10/11, macOS, Linux",
                "Native OS notification",
                "—",
                "OS default sound; a custom file in the `sound` build",
                "—",
                "—",
              ],
              [
                "tez-Szymon/CCNotify",
                "Claude Code",
                "macOS 13+, Windows 10/11, WSL",
                "Desktop banner, iPhone web push",
                "iPhone only, through its own web app and relay",
                "—",
                "Yes, back to the originating terminal",
                "—",
              ],
              [
                "daniil4545/ccnotify",
                "Claude Code",
                "macOS",
                "Desktop (terminal-notifier, or plain `osascript` without click)",
                "—",
                "Set per event (macOS system sound names)",
                "Yes, raises the window that holds the project",
                "—",
              ],
              [
                "dmxj/ccnotify",
                "Claude Code, Codex CLI",
                "macOS 13+",
                "On-screen cards",
                "—",
                "Per-category sounds",
                "Yes, window and tab (Terminal, iTerm2, tmux)",
                "Yes: Allow, Deny, or allow for the session",
              ],
            ],
          },
          {
            kind: "p",
            text: "Where a ccnotify tool does something anotifier doesn't:",
          },
          {
            kind: "ul",
            items: [
              "**dmxj/ccnotify** lets you approve or deny a tool call from the notification card. anotifier 1.7.1 only alerts you; there is no approval feature in a release.",
              "**Helmi/CCNotify** speaks, and it watches tool use (`PreToolUse`, `PostToolUse`) for risky commands and errors. anotifier plays a sound or rings the bell but never speaks, and it alerts on turn end and needs-input only.",
              "**dazuiba/CCNotify** puts how long the task took in the banner, and its click opens the project in VS Code on macOS. anotifier shows no duration, and its click-to-focus works on Windows only.",
              "**tez-Szymon, daniil4545 and dmxj** return you to the terminal when you click a macOS banner. tez-Szymon does the same on Windows and sends iPhone alerts through a web app, so you don't need the ntfy app, and it waits until your computer has been idle for 15 seconds before it forwards one.",
              "**daniil4545/ccnotify** can mute permission and idle banners while the window is focused. anotifier has no foreground-window muting; it has [snooze and quiet hours](/docs/), which silence every channel.",
            ],
          },
          {
            kind: "p",
            text: "Where anotifier covers different ground: Codex CLI, Cursor, Gemini CLI and Antigravity CLI alongside Claude Code; desktop toasts on Windows, macOS, Linux and WSL; phone push through ntfy; Slack, [Discord](/discord/), Telegram and generic webhooks; one shared config file; `anotifier doctor` to check delivery; and no npm dependencies. Which tool fits depends on what you need. If you only use Claude Code on a Mac and want a banner that opens VS Code, dazuiba's script does that with little to install. If you came for ccnotify's Discord hook, the [Discord page](/discord/) shows how anotifier posts there.",
          },
        ],
      },
      {
        id: "switch",
        title: "How do I switch to anotifier, or run both?",
        blocks: [
          {
            kind: "p",
            text: "To switch, remove the ccnotify hooks first, then run anotifier's setup. Whether a project documents its own removal:",
          },
          {
            kind: "table",
            head: ["Project", "Removal"],
            rows: [
              [
                "dazuiba/CCNotify",
                "Documented: delete the hook commands that mention `ccnotify` from `~/.claude/settings.json`, then `rm -rf ~/.claude/ccnotify`",
              ],
              [
                "foxytanuki/ccnotify",
                "No uninstall command in its README. Remove its `Stop` entries from the settings file; the scripts it generated are in `~/.local/share/ccnotify/`. It backs the settings file up before each change",
              ],
              [
                "Helmi/CCNotify",
                "No uninstall section in its README. Remove the entries that run `ccnotify.py` from `settings.json`; `~/.claude/ccnotify/` holds its script and config",
              ],
              [
                "MoYeRanqianzhi/CCNotify",
                "No uninstall section in its README. Remove its `Stop` entry",
              ],
              [
                "tez-Szymon/CCNotify",
                "Documented: run the app with `--uninstall-hook` (`/Applications/CCNotify.app/Contents/MacOS/CCNotify --uninstall-hook` on macOS, `.\\CCNotify.exe --uninstall-hook` on Windows)",
              ],
              [
                "daniil4545/ccnotify",
                "No uninstall section in its README. Remove its entries from `settings.json`; `ccnotify init` left a `.bak` of the file it changed",
              ],
              [
                "dmxj/ccnotify",
                "Documented: turn off its login item, trash `CCNotify.app`, delete the entries that mention `ccnotify-hook` from `~/.claude/settings.json` (and `~/.codex/hooks.json`), delete `~/.ccnotify/`",
              ],
            ],
          },
          {
            kind: "code",
            lang: "bash",
            code: [
              "npx anotifier@latest setup    # wires Claude Code and any other agent it finds",
              "npx anotifier@latest status   # confirms which hooks it wrote",
              "npx anotifier@latest test     # sends a test notification down every channel",
            ].join("\n"),
          },
          {
            kind: "p",
            text: "Restart Claude Code afterwards so it reads the new hooks. Setup adds its own `Notification` and `Stop` entries to `~/.claude/settings.json` (after backing the file up) and leaves your other hooks alone.",
          },
          {
            kind: "p",
            text: "To run both, remember that hooks from different tools add up: if both are on `Stop`, both fire, and you get two notifications. Give each tool its own channel. This anotifier config keeps ccnotify's desktop banner as the only one and uses anotifier for phone push alone:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              toast: { enabled: false },
              terminalBell: { enabled: false },
              ntfy: { enabled: true },
            }),
          },
          {
            kind: "p",
            text: "Put that in `~/.anotifier/config.json`; anything you leave out keeps its default. anotifier's duplicate guard collapses repeated fires of its own hook only, and `snooze` silences all of anotifier's channels, so neither stops another tool's banner. The ccnotify tools only hook Claude Code, except dmxj's, which also hooks Codex; for Cursor, Gemini CLI and Antigravity CLI there is nothing to double up.",
          },
        ],
      },
      {
        id: "sources",
        title: "Sources",
        blocks: [
          {
            kind: "p",
            text: "Each ccnotify claim above comes from the project's own README, source code or registry page, read on 2026-10-12. Projects change, so confirm anything you rely on there.",
          },
          {
            kind: "ul",
            items: [
              "dazuiba/CCNotify: [README and source](https://github.com/dazuiba/CCNotify)",
              "foxytanuki/ccnotify: [README and source](https://github.com/foxytanuki/ccnotify), [npm package](https://www.npmjs.com/package/ccnotify)",
              "Helmi/CCNotify: [README and source](https://github.com/Helmi/CCNotify), [PyPI package](https://pypi.org/project/ccnotify/), [changelog](https://github.com/Helmi/CCNotify/blob/main/CHANGELOG.md)",
              "MoYeRanqianzhi/CCNotify: [README](https://github.com/MoYeRanqianzhi/CCNotify)",
              "tez-Szymon/CCNotify: [README](https://github.com/tez-Szymon/CCNotify)",
              "daniil4545/ccnotify: [README](https://github.com/daniil4545/ccnotify)",
              "dmxj/ccnotify: [README](https://github.com/dmxj/ccnotify), [landing page](https://dmxj.github.io/ccnotify/)",
              "ningjiaen123/CCNotify-Windows: [README](https://github.com/ningjiaen123/CCNotify-Windows)",
              "anotifier: the [README](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor#readme), [docs](/docs/), and the [agent hooks](/guides/agent-hooks-explained/) and [Claude Code notifications](/guides/claude-code-notifications/) guides",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "What is ccnotify?",
        a: "It is a name shared by several unrelated open-source tools that notify you about Claude Code: a macOS Python script (dazuiba/CCNotify), an npm package that writes Stop hooks for Discord, ntfy and macOS (foxytanuki/ccnotify), a PyPI package that speaks notifications (Helmi/CCNotify), a Rust binary for Windows, macOS and Linux (MoYeRanqianzhi/CCNotify) and three newer macOS or tray apps. They have different authors and different code.",
      },
      {
        q: "Is the ccnotify on npm the same as the one on PyPI?",
        a: "No. The npm package ccnotify (version 0.1.1) is foxytanuki's hook generator for Discord, ntfy and macOS. The PyPI package ccnotify (version 0.1.13) is Frank Helmschrott's Helmi/CCNotify, which speaks notifications with text-to-speech. dazuiba's popular CCNotify is on neither registry under that name.",
      },
      {
        q: "How do I know which ccnotify I installed?",
        a: "Search ~/.claude/settings.json for the word ccnotify and look at the hook command. A script path ending in the event name is dazuiba's, uv run is Helmi's, a .sh script under ~/.local/share/ccnotify is foxytanuki's, and a CCNotify app or ccnotify-hook path is one of the tray or menu-bar apps. Inside Claude Code, /hooks lists every active hook.",
      },
      {
        q: "Which ccnotify works on Windows?",
        a: "By their READMEs, MoYeRanqianzhi/CCNotify shows native Windows toasts and tez-Szymon/CCNotify is a Windows tray app. foxytanuki's README lists Windows too, but its hooks are bash scripts that need jq and curl and its only desktop notification is for macOS. A Windows port of dazuiba's script also exists. anotifier shows Windows toasts through BurntToast.",
      },
      {
        q: "Does any ccnotify send notifications to my phone?",
        a: "foxytanuki/ccnotify can post to an ntfy.sh topic, and tez-Szymon/CCNotify has optional iPhone alerts through a web app. The others show desktop notifications only. anotifier sends phone push through ntfy for Android and iOS.",
      },
      {
        q: "Does ccnotify work with Codex, Cursor or Gemini CLI?",
        a: "According to their READMEs, all of them are Claude Code only except dmxj/ccnotify, which also supports Codex CLI. anotifier supports Claude Code, Codex CLI, Cursor, Gemini CLI and Antigravity CLI.",
      },
      {
        q: "Can I use ccnotify and anotifier together?",
        a: "Yes, but if both hook the same Claude Code event you get two notifications. Turn off the overlapping channel in one of them, for example set toast.enabled and terminalBell.enabled to false in ~/.anotifier/config.json so anotifier only sends phone push and the ccnotify tool keeps the desktop banner.",
      },
      {
        q: "Is anotifier related to ccnotify?",
        a: "No. anotifier is a separate open-source project from DevinoSolutions and is not a fork of any ccnotify tool. The similar name is a coincidence.",
      },
      {
        q: "Are the ccnotify projects still maintained?",
        a: "It varies. On 2026-10-12, dazuiba's last commit was 2025-10-14, the npm package's last release was 2025-07-31, and the PyPI package's last release was 2025-08-10. The Rust, Go, tray and menu-bar projects had releases between April and September 2026. Check a repository's recent commits before you depend on it.",
      },
    ],
  },
];
