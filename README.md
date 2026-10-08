<h1 align="center">anotifier</h1>

<p align="center">
  <strong>Desktop & phone notifications for AI coding agents</strong><br />
  One tool. One config. Every agent. Never miss when your AI finishes or needs input.
</p>

<p align="center">
  <img src="assets/icons/claude.png" alt="Claude Code" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/codex.png" alt="Codex CLI" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/cursor.png" alt="Cursor" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/gemini.png" alt="Gemini CLI" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/vscode.png" alt="VS Code" width="36" />
</p>

<p align="center">
  <a href="https://anotifier.io"><strong>anotifier.io</strong></a>
  &nbsp;·&nbsp;
  <a href="https://anotifier.io/docs/"><strong>Documentation</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/sponsors/DevinoSolutions"><strong>Support the project</strong></a>
</p>

<p align="center">
  <a href="https://anotifier.io"><img src="https://img.shields.io/badge/website-anotifier.io-6c5ce7" alt="anotifier.io" /></a>
  <a href="https://www.npmjs.com/package/anotifier"><img src="https://img.shields.io/npm/v/anotifier?color=cb3837&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/anotifier"><img src="https://img.shields.io/npm/dm/anotifier?color=blue" alt="npm downloads" /></a>
  <a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/unit.yml"><img src="https://img.shields.io/github/actions/workflow/status/DevinoSolutions/anotifier-for-claude-codex-cursor/unit.yml?branch=main&label=tests" alt="Unit tests" /></a>
  <a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18" /></a>
  <img src="https://img.shields.io/badge/dependencies-zero-success" alt="Zero Dependencies" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/Android-3DDC84?style=flat-square&logo=android&logoColor=white" alt="Android" />
  <img src="https://img.shields.io/badge/iOS-000000?style=flat-square&logo=ios&logoColor=white" alt="iOS" />
</p>

<p align="center">
  <img src="assets/media/hero.png" alt="Desktop toasts on the laptop and ntfy push notifications on the phone — Claude Code task complete, Codex needs input, Cursor agent finished" width="660" />
</p>

---

## Demo

https://github.com/user-attachments/assets/5714b528-7e04-478e-abfd-2a3d05db562c

[Watch with sound on YouTube](https://www.youtube.com/watch?v=QVVOIIud4-I)

## Quick Start

```bash
npx anotifier@latest setup
```

That's it. The setup wizard detects your platform and installed AI tools, wires the hooks, and optionally configures phone push notifications. Restart your AI tools to activate.

## Features

- **Desktop toast notifications** -- Windows (BurntToast), macOS (Notification Center), Linux (libnotify)
- **WSL toast routing** -- toasts from inside WSL are routed to Windows over PowerShell interop instead of a Linux notification daemon (see the proof boundary below)
- **Phone push notifications** -- Android & iOS via [ntfy](https://ntfy.sh) (free, no account required)
- **Webhook notifications** -- Slack, Discord, Telegram, or any HTTP endpoint, with an optional auth header
- **Rich notification content** -- Claude Code toasts and webhooks show what the agent actually said or asked, not a generic line
- **Terminal bell** -- audible ding in the terminal that launched the agent (works over SSH/tmux)
- **Click-to-focus** -- click the toast to jump back to the terminal or VS Code window (Windows)
- **Codex approval alerts** -- get notified the instant Codex asks for permission, not just when it finishes
- **Per-tool branded icons** -- each tool gets its own logo in the notification
- **One unified config** -- shared `~/.anotifier/config.json` across all tools
- **Atomic deduplication** -- prevents double notifications (e.g. Cursor's duplicate hook fires)
- **Zero dependencies** -- pure Node.js built-ins only, no npm production packages

## Supported Tools

<table>
  <tr>
    <th>Tool</th>
    <th>VS Code</th>
    <th>CLI</th>
    <th>Task Complete</th>
    <th>Needs Input</th>
  </tr>
  <tr>
    <td><img src="assets/icons/claude.png" width="18" />&nbsp; <strong><a href="https://anotifier.io/claude-code/">Claude Code</a></strong></td>
    <td align="center">Native</td>
    <td align="center">Native</td>
    <td><code>Stop</code></td>
    <td><code>Notification</code></td>
  </tr>
  <tr>
    <td><img src="assets/icons/codex.png" width="18" />&nbsp; <strong><a href="https://anotifier.io/codex/">Codex CLI</a></strong></td>
    <td align="center">Native</td>
    <td align="center">Native</td>
    <td><code>Stop</code></td>
    <td><code>PermissionRequest</code></td>
  </tr>
  <tr>
    <td><img src="assets/icons/cursor.png" width="18" />&nbsp; <strong><a href="https://anotifier.io/cursor/">Cursor</a></strong></td>
    <td align="center">Native</td>
    <td align="center">--</td>
    <td><code>stop</code></td>
    <td>--</td>
  </tr>
  <tr>
    <td><img src="assets/icons/gemini.png" width="18" />&nbsp; <strong><a href="https://anotifier.io/gemini-cli/">Gemini CLI</a></strong></td>
    <td align="center">--</td>
    <td align="center">Native</td>
    <td><code>AfterAgent</code></td>
    <td><code>Notification</code></td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>Antigravity CLI</strong></td>
    <td align="center">--</td>
    <td align="center">Native</td>
    <td><code>Stop</code></td>
    <td>--</td>
  </tr>
</table>

All five tools are wired automatically by the setup wizard. No manual config editing needed. Codex's `PermissionRequest` hook fires the same "needs your input" alert when Codex asks for approval to run a command -- verified with Codex CLI >=0.144.0.

**Antigravity CLI** (Google's successor to Gemini CLI for Google AI Pro/Ultra and free Code Assist users) reads hooks from its own file, `~/.gemini/config/hooks.json`. Setup wires it when `~/.gemini/antigravity-cli` exists, adding one group named `anotifier` with a `Stop` handler and leaving your other groups alone; `anotifier uninstall` removes only that group. Google's Antigravity 2.0 app and Antigravity IDE read the same global file, so the handler fires when they finish too. The `Stop` handler answers `{"decision":"stop"}` so it can never keep the agent running. The notification is the generic "Task complete" line, and a `Stop` caused by an error or a cancel says "Task complete" too: anotifier does not read `terminationReason` (its values are not fully documented) or `fullyIdle`, so every `Stop` alerts. Antigravity has no notification or permission event (its events are `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`), so there is no "needs input" alert for it. What is verified: hook wiring and payload parsing are unit-tested against the format in [Google's hooks docs](https://antigravity.google/docs/hooks). What is not: there is no live Antigravity CLI lane in CI yet, so it has not been exercised against a real Antigravity CLI run.

### VS Code Native Support

Claude Code, Codex, and Cursor all run inside VS Code. **anotifier** hooks directly into each tool's native hook system -- no VS Code extension required. The setup wizard detects installed tools and patches their configs automatically. On Windows, click a notification toast to jump straight back to your VS Code window (Cursor alerts are the exception: Cursor sends no project folder to match). More on the [VS Code page](https://anotifier.io/vscode/).

## Installation

### npm (recommended)

```bash
# One-shot setup (no install needed)
npx anotifier@latest setup

# Or install globally
npm i -g anotifier
anotifier setup
```

### Claude Code Plugin

Add the marketplace, then install the plugin from it:

```
/plugin marketplace add DevinoSolutions/anotifier-for-claude-codex-cursor
/plugin install anotifier@anotifier
```

Hooks auto-register. Use `/anotifier:setup` to wire other tools.

### Standalone (no npm)

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/DevinoSolutions/anotifier-for-claude-codex-cursor/main/setup/install.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/DevinoSolutions/anotifier-for-claude-codex-cursor/main/setup/install.sh | bash
```

## CLI Commands

```
anotifier setup            # First-time setup wizard
anotifier status           # Show wired tools, config, backends
anotifier test [channel]   # Fire test notification (toast | ntfy | webhook | bell | both)
anotifier config [section] # Interactive settings (ntfy | webhook | sounds | events | sentry)
anotifier doctor [--deep]  # Diagnose delivery per channel (--deep verifies real delivery)
anotifier snooze [dur]     # Silence every channel for a while (30m | 2h | 90s | 45 = 45 minutes)
anotifier snooze off       # Cancel the snooze early
anotifier telemetry        # Show or change the opt-in anonymous usage stats (on | off); 1.3.0 and later
anotifier uninstall        # Remove hooks from all tools
```

`anotifier snooze` with no argument prints the current state (`Snoozed until 14:32` or `Not snoozed`); `anotifier status` shows the same thing. A snooze silences **every** channel -- toast, ntfy, webhook and the terminal bell -- until it expires on its own, and it survives across sessions because the deadline is stored in `~/.anotifier/.snooze.json`.

## Configuration

Config lives at `~/.anotifier/config.json`. Abbreviated — see [config/default-config.json](config/default-config.json) for every key and default:

```json
{
  "ntfy": {
    "enabled": true,
    "server": "https://ntfy.sh",
    "topic": "anotifier-<random>",
    "click": ""
  },
  "toast": {
    "enabled": true,
    "clickToFocus": true
  },
  "terminalBell": {
    "enabled": true
  },
  "webhook": {
    "enabled": false,
    "url": "",
    "format": "generic"
  },
  "sentry": {
    "enabled": false,
    "dsn": ""
  },
  "updateCheck": {
    "enabled": true
  },
  "telemetry": {
    "enabled": false,
    "asked": false
  },
  "quietHours": {
    "enabled": false,
    "from": "22:00",
    "to": "08:00"
  },
  "events": {
    "task_complete": { "toastSound": "IM", "priority": "default" },
    "needs_input": { "toastSound": "Reminder", "priority": "urgent" },
    "session_start": {
      "toastSound": "Default",
      "priority": "low",
      "toastEnabled": false,
      "ntfyEnabled": false,
      "terminalBellEnabled": false
    }
  }
}
```

`ntfy.click` is the URL opened when you tap a phone notification (empty = no link). `terminalBell` rings the terminal that launched the agent -- for Claude Code (>=2.1.141) it rings through Claude Code's own terminal write path (hook JSON `terminalSequence`), which is safe in tmux, GNU screen, and on Windows per Claude Code's docs; other agents get a direct TTY/console bell. `webhook` posts to Slack, Discord, Telegram, or any URL (see below). `sentry` is opt-in error reporting (see [Error visibility](#error-visibility)). `updateCheck` announces a newly published anotifier through whichever of your toast / ntfy / webhook channels are already on (never the terminal bell) -- it asks the npm registry at most once per day, tells you at most once per version, and stays silent on any error; set `enabled` to `false` to turn it off entirely, and no check or state write happens at all. `telemetry` (1.3.0 and later) is the opt-in anonymous usage-stats choice: `enabled` is the choice (default `false`), and `asked` records that you made it (`setup` and `anotifier telemetry on|off` set it) so re-running setup does not ask again -- see [Usage stats](#usage-stats). `quietHours` is a recurring nightly version of `snooze` (see [Quiet hours](#quiet-hours)). Per-event `toastSound` names a Windows [BurntToast](https://github.com/Windos/BurntToast) sound; on macOS the name is mapped to the closest built-in system sound (Windows names like `IM`/`Reminder` are translated, and `Default` or unrecognized names fall back to the system default), while on Linux it is ignored; `priority` (`min` / `low` / `default` / `high` / `urgent`) drives both the ntfy push priority and the Linux `notify-send` urgency.

### Quiet hours

Off by default. Set `quietHours.enabled` to `true` and every channel goes silent inside the window, every day:

```json
{
  "quietHours": {
    "enabled": true,
    "from": "22:00",
    "to": "08:00"
  }
}
```

- Times are `"HH:MM"` on a 24-hour clock, in your machine's **local** time.
- The start is inclusive and the end is exclusive: `22:00` is silenced, `08:00` is not.
- Windows may span midnight. `22:00` -> `08:00` covers 22:00-23:59 **and** 00:00-07:59. A same-day window like `08:00` -> `22:00` works the same way.
- `from` equal to `to` is a zero-length window and turns the feature **off**, rather than silencing you for a full 24 hours.
- A time that isn't a valid `HH:MM` disables the whole block instead of falling back to the default window -- a typo should never silence you -- and the problem is reported by `anotifier status`.

`anotifier status` shows the window and whether you are currently inside it.

**How quiet hours and `snooze` interact:** they are independent, and either one alone silences the run -- there is no per-channel scoping, it is all channels or none. A silenced run is silenced completely: no toast, no ntfy push, no webhook POST, no terminal bell, and no update notice either. What does *not* change is the hook contract -- the hook still exits successfully and still returns the response its agent expects, so silencing notifications can never stall or break Claude Code, Codex, Cursor, Gemini CLI or Antigravity CLI. The daily update check simply runs on the next un-silenced run.

### ntfy -- Phone Push Notifications

[ntfy](https://ntfy.sh) sends free push notifications to your phone -- no account needed.

1. Install the ntfy app ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/app/ntfy/id1625396347))
2. Subscribe to your topic (shown during setup)
3. All your AI tools' notifications appear in one stream

### Webhook -- Slack, Discord, Telegram, or anything

Set `webhook.enabled: true` and a `webhook.url` to POST a notification to any HTTP endpoint. `format` selects the payload shape:

**Slack** ([setup guide](https://anotifier.io/slack/)):
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://hooks.slack.com/services/...",
    "format": "slack"
  }
}
```

**Discord** ([setup guide](https://anotifier.io/discord/)):
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://discord.com/api/webhooks/...",
    "format": "discord"
  }
}
```

**Telegram:**
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://api.telegram.org/bot<token>/sendMessage",
    "format": "telegram",
    "chatId": "123456789"
  }
}
```

**Generic (anything else):**
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://example.com/hook",
    "format": "generic",
    "authorization": "Bearer <token>"
  }
}
```
Generic POSTs `{title, message, source, project, event, timestamp}` as JSON. `authorization`, if set, is sent as the `Authorization` header for any format, not just generic.

Webhook failures are logged with the URL's origin only, never the full URL -- a Slack/Discord webhook URL or a Telegram bot token is a secret, and errors.log can be mirrored to Sentry.

Test it with `anotifier test webhook`, or turn it off for one event type with `"events": {"task_complete": {"webhookEnabled": false}}`.

### Rich notification content

For Claude Code, toast and webhook notifications show what actually happened instead of a generic "task complete" line: a "needs input" notification carries Claude's own question, and a "task complete" notification carries the last assistant message, both read from the Claude Code transcript and trimmed to a short snippet. Session-start notifications stay generic (nothing to show yet). Other agents (Codex, Cursor, Gemini, Antigravity) always get the generic text -- transcript reading is Claude Code-only.

Controlled per channel:

| Channel | Config key | Default |
|---------|-----------|:-------:|
| Toast | `toast.richContent` | `true` |
| Webhook | `webhook.richContent` | `true` |
| ntfy | `ntfy.richContent` | `false` |

`ntfy.richContent` defaults to **false** for privacy: the default `ntfy.sh` server is public, ntfy topic names are guessable rather than access-controlled secrets, and a snippet of your conversation would leak to anyone who guesses or stumbles on your topic. Only enable `ntfy.richContent` if you run your own private ntfy server, or you've deliberately accepted that risk on the public one.

### Per-Event Settings

| Event | Default `toastSound` | Default `priority` | Description |
|-------|:------------:|:-------------:|-------------|
| `task_complete` | IM | default | Agent finished its task |
| `needs_input` | Reminder | urgent | Agent needs your input or permission |
| `session_start` | Default | low | New session started (all channels off by default) |

**Only Claude notifications that wait on you are urgent.** Claude Code's `Notification` hook fires for many kinds of notification and names each one in its `notification_type` field. anotifier reads that field and alerts as follows:

| Claude `notification_type` | What you get |
|---|---|
| `permission_prompt` | "Needs your permission" at the `needs_input` priority (urgent by default) |
| `elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input` | "Needs your input" at the `needs_input` priority |
| `quota_auto_resume_stale` | "Needs you to resume" at the `needs_input` priority (Claude Code is waiting for Enter after a usage-limit reset) |
| `idle_prompt` | "Needs your input" at the idle-reminder level, `default` unless you set `idleReminderPriority` (see below) |
| `agent_completed`, `quota_auto_resume_fired`, `quota_auto_resume_disabled` | A short notice at `default` priority with an info tag. It is never urgent. These use a fixed normal priority, tags and sound and do not inherit `events.needs_input` overrides. |
| `auth_success`, `elicitation_response`, `elicitation_complete` | No alert, because each one follows something you just did at the keyboard |
| Any other value | "Needs your attention" at the `needs_input` priority (urgent by default), so a type added in a future Claude Code release can never go quiet while Claude waits on you |
| No `notification_type` (older Claude Code) | Same as before: urgent "Needs your input", with the idle-reminder wording check below |

**Claude's idle reminder is quieter than a real prompt.** About a minute after a turn ends, Claude Code sends a second notification along the lines of *"Claude is waiting for your input"* (`idle_prompt`). Nothing is blocked -- the work is done -- so anotifier delivers that one at `default` priority with a calm tag instead of the urgent `needs_input` treatment. A genuine permission prompt is untouched and still arrives urgent. The reminder is never suppressed, only turned down. On older Claude Code that sends no `notification_type`, the reminder is recognized by its wording, and if Claude ever changes that wording the reminder simply goes back to being urgent -- it can never go silent. To pick your own level for it, set `idleReminderPriority` on the event:

```json
{
  "events": {
    "needs_input": { "idleReminderPriority": "low" }
  }
}
```

It takes the same `min` / `low` / `default` / `high` / `urgent` scale as `priority`, and applies only to the idle reminder.

### Error visibility

Hook and channel errors never interrupt your agent -- they're appended to `~/.anotifier/errors.log` and surfaced by `npx anotifier status`, so a misconfigured toast backend or unreachable ntfy topic shows up as a logged error instead of a silent no-op. Set `sentry.enabled` to `true` (with a `sentry.dsn`) to also mirror those errors to [Sentry](https://sentry.io) through a built-in, zero-dependency envelope client: no SDK is bundled, nothing leaves your machine unless you opt in, and only error data is sent.

### Usage stats

**Version 1.3.0 and later** can share anonymous usage stats. They are off unless you say yes, and 1.2.6 and earlier send nothing.

- **Who is asked, and when.** The first `anotifier setup` you run in an interactive terminal asks (the default answer is Yes). A setup that is not run in a terminal -- piped input, or driven by an agent such as the `/anotifier:setup` command -- never asks and leaves stats **off**, and so does a setup whose input closes before you answer. Re-running `setup` never changes a choice you already made. A plugin-only install never runs setup, so it never sends anything.
- **Change it any time:**

```
anotifier telemetry        # on/off, your install id, and the exact counts waiting to be sent
anotifier telemetry off    # stop; deletes the local install id and pending counts
anotifier telemetry on
```

- **Where it goes.** Events are sent to the project's own self-hosted [PostHog](https://posthog.com) at `posthog.devino.ca`, which the anotifier maintainers can read. Every event carries a random install id (created on first use, stored in `~/.anotifier/.telemetry.json`, derived from nothing about you or your machine) and `$geoip_disable: true`. Your IP address necessarily reaches the server, as with any connection, but the server is configured to discard client IP addresses, and no location is derived from them.
- **Deleting what was sent.** `anotifier telemetry` shows your install id, and `anotifier telemetry off` prints the id it just deleted. To have the data already stored under an id removed, [open a GitHub issue](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/issues) with that id. Without it there is no way to tell which events are yours.
- **Always off** regardless of the setting when `DO_NOT_TRACK=1`, `ANOTIFIER_TELEMETRY=0`, or `CI` is set.

**Never sent:** message text, project names, file paths, ntfy topics or servers, webhook URLs, hostnames, usernames, session ids, or error messages. Anything that is not on a fixed list below is sent as `other`, or as a name clamped to at most 40 letters, digits, `_`, `.` and `-` (which is how an unrecognized hook event name or an error class name is handled -- see `unmapped_events` and `cli_error`).

**Every event, and every property it carries.** All events also carry the install id, a timestamp, and these base properties: `$lib` (`anotifier`), `$lib_version` and `anotifier_version` (the anotifier version), `os` (`win32`, `darwin`, `linux`), `os_release` (the OS kernel/build version string), `arch` (`x64`, `arm64`, ...), `node_version`, and `$geoip_disable` (`true`). When a command produces two events they travel in one request.

| Event | Sent when | Properties |
| --- | --- | --- |
| `cli_command` | a CLI command finishes (not for `telemetry`) | `command` (`setup`, `status`, `test`, `config`, `doctor`, `snooze`, `uninstall`), `args` (a list; each is one of `--deep`, `--json`, `--strict`, `toast`, `ntfy`, `webhook`, `bell`, `both`, `sounds`, `events`, `sentry`, `off`, and anything else you typed -- a snooze duration, a typo -- is `other`), `exit_code`, `duration_ms` |
| `cli_error` | a command throws | `command` (as above, or `other`), `error_name` (the error class name, clamped; `Error` if it does not fit), `error_code` (e.g. `ENOENT`, clamped; `null` if there is none). Never the error message. |
| `setup_completed` | `setup` finishes | `tools_detected` (any of `claude`, `codex`, `cursor`, `gemini`, `antigravity`), `toast_backend_ready`, `icon_ready`, `config_rebuilt`, `ntfy_enabled` (booleans) |
| `setup_failed` | `setup` finds no tool, or cannot patch one | `step` (`no_tools` or `patch`); for `patch` also `tools_detected` and `failed_tools` (same names as above) |
| `telemetry_enabled` | you run `anotifier telemetry on` | `via` (`command`) |
| `test_result` | `anotifier test` | `channel` (`toast`, `ntfy`, `webhook`, `bell`, `both`, or `all`), `outcomes` (per channel: `sent`, `failed`, `not_configured` or `skipped`) |
| `doctor_result` | `anotifier doctor` | `deep`, `strict` (booleans), `checks` (check id -> `ok`, `info`, `warn` or `fail`; ids: `toast-backend`, `toast-auth`, `toast-deep`, `deep-probe`, `bell`, `ntfy-config`, `webhook-config`, `config`, `focus`). Never the check's detail text. |
| `uninstall_result` | `anotifier uninstall` | `removed`, `failed` (lists of `Claude Code`, `Codex CLI`, `Cursor IDE`, `Gemini CLI`, `Antigravity CLI`, `agentfocus://`) |
| `hook_daily_summary` | at most once per 24 hours, from the end of a hook run | `runs`; `outcomes` (counts of `dispatched`, `suppressed_snooze`, `suppressed_quiet`, `held_back`, `skipped`, `duplicate`, `unmapped`, `error`); `sources` (`claude`, `codex`, `cursor`, `gemini`, `antigravity`, `other`); `events` (`task_complete`, `needs_input`, `session_start`, `other`); `unmapped_events` (counts per unrecognized hook event name, clamped as above, at most 10 distinct names, the rest under `other`); `channels` (`toast`, `ntfy`, `webhook`, `bell`, each with `ok` and `fail` counts); `latency` (counts per bucket: `lt_250ms`, `lt_500ms`, `lt_1s`, `lt_2500ms`, `ge_2500ms`); `window_start`, `window_hours`; and `config`, which says which features are on: `toast_enabled`, `toast_rich`, `ntfy_enabled`, `ntfy_rich`, `ntfy_custom_server` (whether the server is not ntfy.sh -- never which server), `webhook_enabled`, `webhook_format` (`generic`, `slack`, `discord`, `telegram`, `other`, or `null`), `bell_enabled`, `quiet_hours_enabled`, `update_check_enabled`, `sentry_enabled` |

Hook runs themselves send nothing: each only bumps counters in `~/.anotifier/.telemetry.json`, and the end of a hook run sends the daily summary (waiting at most 0.8 seconds for the server; the limit covers the network send, and a failure never changes what the hook returns to your agent). CLI commands send their events in one request at the end of the command, waiting at most one second.

## How It Works

Each AI tool's hook system pipes event data to `notify.mjs`:

```
Hook fires (stdin JSON + --source flag)
  -> parse-input.mjs   (normalize across tools)
  -> router.mjs        (map event to notification type)
  -> transcript.mjs    (Claude Code only: derive rich message text)
  -> platform toast    (Windows / macOS / Linux / WSL)
  -> ntfy push         (phone notification)
  -> webhook POST      (Slack / Discord / Telegram / generic)
  -> terminal bell     (Claude Code: terminalSequence in the hook reply;
                        other tools: BEL to the controlling terminal)
```

## Platform Details

### Windows

- [BurntToast](https://github.com/Windos/BurntToast) PowerShell module for rich toast notifications
- Click-to-focus via custom `agentfocus://` URI protocol (registered under HKCU on the first toast; `anotifier uninstall` removes it)
- BurntToast auto-installed during setup if missing
- Requires PowerShell 7+ (pwsh); Windows PowerShell 5.1 alone is not enough, and `anotifier doctor` fails the toast check until pwsh is installed

### macOS

- Uses built-in `osascript` -- zero additional dependencies

### Linux

- Uses `notify-send` (libnotify) -- available on most desktop distributions
- If `setup` cannot find `notify-send` it turns the toast channel off (`toast.enabled: false`, with `toast.disabledBySetup: true`) and tells you what to install; `status` and `doctor` then show "toast: off, no backend". Install it and re-run `anotifier setup` to turn toasts back on. The same applies on Windows without PowerShell 7 / BurntToast and on WSL without reachable Windows PowerShell. Toasts you turned off yourself are never turned back on.
- On headless systems without a GUI the toast fails and is logged to `~/.anotifier/errors.log`; the other channels still deliver (see WSL below for WSL2)

### WSL

- Auto-detected -- no config needed
- Toast notifications are routed to Windows via PowerShell interop (`powershell.exe`/`pwsh.exe` across the `/mnt/c` boundary) instead of `notify-send`/D-Bus, so no Linux notification daemon is needed
- Needs WSL2 interop enabled and a Windows PowerShell present -- both are on by default
- `anotifier setup`, `status` and `doctor` report WSL as its own platform and check the interop path (`wslpath` plus a reachable PowerShell); a toast that fails is recorded in the hook error log that `anotifier status` shows
- Terminal bell and ntfy behave exactly as on native Linux
- **Proof boundary:** WSL detection and the interop invocation are unit-tested (`tests/platforms-wsl.test.mjs`), but — unlike the native Linux/macOS/Windows toast lanes — no hosted CI runner proves a toast reaches the Windows host end to end, so this path is not claimed in the Testing table below

## Requirements

| Requirement | Details |
|-------------|---------|
| **Node.js** | >= 18.0.0 (already present for all supported AI tools) |
| **Windows** | PowerShell 7+ (pwsh) |
| **macOS** | osascript (built-in) |
| **Linux** | notify-send (optional, for desktop toasts) |

## Uninstall

```bash
anotifier uninstall
```

Removes all managed hooks from every tool's config. Original configs are backed up at `~/.anotifier/backups/`.

## Testing

Everything below is verified against the **real thing** — no mocks, no stubs, no fakes. Real ntfy.sh push delivery, a real Linux notification daemon receiving the exact payload, the real agent CLIs installed from npm and driven end to end, and the real native OS toast backends firing — then **read back out of the OS's own notification store** (`dunst` on Linux, Notification Center's database on macOS, `wpndatabase.db` on Windows) to prove the payload actually landed, not just that the call returned 0. Every job is **required** and **hard-fails**: a broken key, a renamed secret, or a hook that doesn't deliver turns CI red instead of skipping silently.

### What CI verifies on every run — all real, all platforms

Each job runs as its own GitHub Actions workflow. The badge in every row is its **live status on `main`** — not a screenshot — so click any badge to see the actual run and its per-test logs.

<table>
  <thead>
    <tr>
      <th>Job</th>
      <th align="center" width="180">Live status</th>
      <th>Platforms</th>
      <th>What is actually exercised (no mocks)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Unit</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/unit.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/unit.yml/badge.svg?branch=main" alt="Unit" /></a></td>
      <td>Linux · macOS · Windows</td>
      <td>The full unit + integration suite against the real exported code (not inline copies)</td>
    </tr>
    <tr>
      <td><strong>E2E real-world</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/e2e.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/e2e.yml/badge.svg?branch=main" alt="E2E" /></a></td>
      <td>Linux · macOS · Windows</td>
      <td>Real <code>setup</code>/<code>uninstall</code> subprocesses against an isolated HOME · real <code>notify.mjs</code> hook invocation per source · <strong>real ntfy.sh round-trip</strong> (push sent, then read back off the server)</td>
    </tr>
    <tr>
      <td><strong>Install + smoke-load</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/agents.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/agents.yml/badge.svg?branch=main" alt="Agents" /></a></td>
      <td>Linux · macOS · Windows</td>
      <td>Installs the <strong>real</strong> Claude, Codex, Gemini (and Cursor where available) CLIs from npm, asserts they launch, and smoke-loads each hook (Codex classification pinned — drift fails CI)</td>
    </tr>
    <tr>
      <td><strong>Live Claude</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-claude.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-claude.yml/badge.svg?branch=main" alt="Live Claude" /></a></td>
      <td>Linux · macOS</td>
      <td>Drives the <strong>real</strong> Claude CLI end to end (paid); <strong>hard-fails</strong> if the Stop hook doesn't deliver a real ntfy push · on macOS it also does a <strong>best-effort</strong> Notification Center read-back (logged, non-blocking — the hard osascript→NC delivery proof is the dedicated Toast macOS lane)</td>
    </tr>
    <tr>
      <td><strong>Live Gemini</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-gemini.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-gemini.yml/badge.svg?branch=main" alt="Live Gemini" /></a></td>
      <td>Linux · macOS</td>
      <td>Drives the <strong>real</strong> Gemini CLI end to end; <strong>hard-fails</strong> if the hook doesn't deliver a real ntfy push · on macOS it also does a <strong>best-effort</strong> Notification Center read-back (logged, non-blocking — the hard NC delivery proof is the dedicated Toast macOS lane)</td>
    </tr>
    <tr>
      <td><strong>Live Codex</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-codex.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-codex.yml/badge.svg?branch=main" alt="Live Codex" /></a></td>
      <td>Linux · macOS</td>
      <td>Validates <code>OPENAI_API_KEY</code> against the <strong>live OpenAI API</strong>, boots the real Codex config + PermissionRequest hook wiring, and drives a <strong>real completed <code>codex exec</code> turn</strong> (asserts it echoes a unique token) ¹</td>
    </tr>
    <tr>
      <td><strong>Live Cursor</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-cursor.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/live-cursor.yml/badge.svg?branch=main" alt="Live Cursor" /></a></td>
      <td>Linux</td>
      <td>Validates the real Cursor config-patch wiring (BYO key) ¹</td>
    </tr>
    <tr>
      <td><strong>TUI Proofs</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/tui-proofs.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/tui-proofs.yml/badge.svg?branch=main" alt="TUI Proofs" /></a></td>
      <td>macOS</td>
      <td>Drives the <strong>real</strong> Claude and Codex TUIs in a live <code>tmux</code> session. <strong>F1</strong>: the Claude terminal <strong>bell</strong> sets tmux's <code>window_bell_flag</code>. <strong>F2</strong>: a <strong>real Codex approval modal</strong> appears, our PermissionRequest notification fires, we approve via send-keys, and the guarded command runs — the full approval decision loop that <code>codex exec</code> structurally can't exercise</td>
    </tr>
    <tr>
      <td><strong>Live Toast Linux</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/toast-linux.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/toast-linux.yml/badge.svg?branch=main" alt="Toast Linux" /></a></td>
      <td>Linux</td>
      <td>Fires through the real <code>notify-send</code> backend into a <strong>real <code>dunst</code> daemon</strong>, then reads its history and asserts it captured the exact title + body — and goes one layer further, proving the notification is <strong>rendered on-screen</strong>: it captures the X display and reads the banner's text back with OCR (nonce present in a during-display frame, absent from the pre-fire frame) ²</td>
    </tr>
    <tr>
      <td><strong>Live Toast macOS</strong><br/>(delivery capture)</td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/toast-macos.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/toast-macos.yml/badge.svg?branch=main" alt="Toast macOS" /></a></td>
      <td>macOS</td>
      <td>Fires the <strong>real</strong> <code>osascript</code> backend, then <strong>reads the delivery back out of Notification Center's own SQLite DB</strong> and asserts the exact payload was recorded — so it fails when a real user would have seen nothing (the silent-drop an exit-code check misses). Also runs <code>anotifier doctor --deep</code> as an independent second check</td>
    </tr>
    <tr>
      <td><strong>Live Toast Native</strong></td>
      <td align="center"><a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/toast-native.yml"><img src="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions/workflows/toast-native.yml/badge.svg?branch=main" alt="Toast Native" /></a></td>
      <td>Windows</td>
      <td>Fires the <strong>real</strong> BurntToast backend, then <strong>reads the notification back out of the Windows notification platform's own store</strong> (<code>wpndatabase.db</code>) and asserts the exact nonce was recorded in the toast's title <strong>and</strong> body — so it fails when a real user would have seen nothing (the silent-drop an exit-code check misses) ³</td>
    </tr>
  </tbody>
</table>

¹ The Live Codex lane completes a real `codex exec` turn, but non-interactive exec structurally can't exercise the **approval decision loop** — with no TTY, codex forces `approval: never` + a read-only sandbox, so the PermissionRequest hook never fires. That loop is proven end to end by the **TUI Proofs** lane (F2), which drives the interactive TUI. Cursor is a GUI editor (BYO key), so its lane validates the live key + real config wiring; its hook **delivery** is fully covered by the unit + e2e suites.

² The on-screen render proof draws the banner with **our** tuned `dunstrc` (large mono font, high contrast) on a **virtual** X display (Xvfb), so it proves the product path renders legible, machine-readable pixels — not that every user's desktop theme renders identically. macOS has no equivalent lane: on the hosted runner a real notification records in Notification Center but never presents a banner, and the accessibility/screen-capture routes are walled off by TCC, so **layer 2 (recorded in Notification Center) is the honest macOS CI ceiling** — on-screen rendering there is a real-machine concern (`npm run toast:demo`), while `anotifier doctor --deep` verifies real **delivery** on your own machine by reading that same Notification Center database back. See [`docs/research/2026-07-15-layer3-render-proof.md`](docs/research/2026-07-15-layer3-render-proof.md).

³ Like macOS, Windows is proven to **layer 2** in CI: the hosted `windows-latest` runner is a headless Session-0 environment with no interactive desktop, so the toast is **recorded** by the Windows notification platform but no banner is presented on a screen. The gate reads the record back out of `wpndatabase.db` (WAL-aware — a freshly fired toast lives in the DB's write-ahead log, so an `immutable=1` open would miss it and falsely report absence) and asserts the exact nonce in the title and body. On-screen rendering is a real-machine concern; for it `anotifier doctor` runs a **static backend check** (PowerShell + BurntToast + execution-policy state) — Windows has no delivery-record read-back in `--deep`, unlike macOS (Notification Center DB) and Linux (`dunst` history). See [`docs/research/2026-07-15-layer3-render-proof.md`](docs/research/2026-07-15-layer3-render-proof.md).

**WSL** has no row above on purpose. WSL toast routing (PowerShell interop across the `/mnt/c` boundary) is unit-tested for detection and interop invocation (`tests/platforms-wsl.test.mjs`, fully deps-injected), but a hosted CI runner cannot host both a WSL guest and an interactive Windows desktop to prove a toast crosses the boundary and lands — so, matching how the Codex `exec` lane doesn't claim the approval-decision loop (¹), that end-to-end delivery is deliberately **not** asserted here.

### Run it yourself

```bash
npm test            # offline: the full unit + integration suite
npm run test:e2e    # real ntfy.sh round-trip, needs network
npm run toast:demo  # fire real desktop toasts, every event
```

### The one thing CI can't prove

CI goes further than "the call returned 0." On **Linux** it reads the payload back out of a real `dunst` daemon **and** captures the X display to OCR the banner's text off the screen — pixels, not just a database row. On **macOS** it reads the delivery back out of Notification Center's own database, and on **Windows** out of the notification platform's `wpndatabase.db` — so a notification that was silently dropped for lack of permission records nothing and turns CI **red** instead of green. What no headless runner can prove is the last millimetre: a human's eyes actually seeing the banner. On macOS and Windows the on-screen banner can't be captured in CI at all (the hosted runner records the notification but never presents it — layer 2 is the ceiling ² ³), and everywhere Do Not Disturb / Focus can suppress the on-screen banner while the notification is still recorded as delivered. So "reached the notification store" is not always "a person saw it." To confirm with your own eyes — and to check your own machine's notification setup — run `npm run toast:demo` and `anotifier doctor --deep`. `--deep` fires a real test notification and reads it back where the OS allows: on **macOS** from Notification Center's database, on **Linux** from the `dunst` daemon's history (where `dunstctl` is present; other daemons honestly report dispatched-but-unverified). On **Windows**, `anotifier doctor` runs a static backend check (PowerShell + BurntToast + execution-policy).

## Website

The source of [anotifier.io](https://anotifier.io) ([docs](https://anotifier.io/docs/), [guides](https://anotifier.io/guides/), [comparison page](https://anotifier.io/compare/), [`llms.txt`](https://anotifier.io/llms.txt)) lives in [`landing/`](landing/) — a static Next.js export, so a fix to the site is a normal PR here. It is not part of the npm package.

```bash
cd landing && npm ci
npm run dev            # local preview
npm run lint && npm run format:check && npm run knip && npm run typecheck && npm run build
```

The `Landing` workflow runs those same checks on every PR that touches `landing/`; merging to `main` deploys the site.

## Support the project

anotifier is free, open source, and has no account and no paid tier. Version 1.3.0 and later add opt-in [usage stats](#usage-stats); with them off (the default unless you answer Yes at an interactive `setup`), nothing is collected. It is built and maintained by [DevinoSolutions](https://github.com/DevinoSolutions). If it saves you time, consider supporting its development: **[github.com/sponsors/DevinoSolutions](https://github.com/sponsors/DevinoSolutions)**. The same link is printed once at the end of `anotifier setup` and `anotifier status`; it never appears in a notification or on the hook path. A successful `setup` also ends with one line asking for a [GitHub star](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor), since that is how other developers find the project. That line is printed nowhere else.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

Release history is in [CHANGELOG.md](CHANGELOG.md).

## License

[AGPL-3.0](LICENSE) -- Copyright (c) 2026 [DevinoSolutions](https://github.com/DevinoSolutions)
