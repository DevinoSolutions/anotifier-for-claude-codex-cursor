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
              "Some integrated terminals, including VS Code's, don't sound the bell by default. There, use a hook (below).",
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
];
