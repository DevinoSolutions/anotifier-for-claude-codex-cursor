# Changelog

All notable changes to `anotifier` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

## [1.8.0] — UNRELEASED (date set at publish)

### Added

- **Skip alerts while you are looking at the agent (opt-in).** New `suppressWhenFocused` (default `false`, off) in `~/.anotifier/config.json`, or `anotifier config focus`: when it is on and the window running the agent (its terminal or editor) is the one in front, "task complete" and needs-input alerts are not sent on any channel (toast, ntfy, webhook, bell). Only an answer of "yes, in front" skips; an unknown answer (tmux, screen, zellij, ssh, Wayland, a probe that fails or times out) sends as usual. It is off by default because it needs a window probe before each alert, which adds about 1 s to each alert on Windows and WSL while it is on, and because another tab or pane of the same terminal window counts as in front. A window left in front while you are away still counts as in front, so the idle reminder is never suppressed. It can be turned on or off for one project in a `projects` rule. Usage-limit and context warnings and the update notice do not use it. `anotifier status` shows it as `When focused`.
- **How long the turn took.** A "task complete" notification now ends with the turn length when it is known, for example `app: Task complete (took 4m 12s)` (also on the assistant's own words when rich content is on). Titles are unchanged. Works for Claude Code, Codex CLI and Gemini CLI, which give a hook at the start of a turn; Cursor and Antigravity CLI have no reliable start signal, so they show nothing.
- **Minimum duration filter.** New `events.task_complete.minDurationSeconds` (default `0`, off): a turn shorter than that many seconds sends no "task complete" alert. Permission prompts and every other needs-input notification are always sent, a turn of unknown length is never skipped, and the key is rejected on any event other than `task_complete`. Set it in `anotifier config events` or `~/.anotifier/config.json`; `anotifier status` shows it as `Min duration`. See the README section "Turn length and the minimum duration filter".
- A timing hook that records when a turn started: `UserPromptSubmit` for Claude Code and Codex CLI, `BeforeAgent` for Gemini CLI. It prints only `{}`, has a 5-second timeout, ignores every error, and keeps its state in `~/.anotifier/turns.json`. Re-run `npx anotifier setup` after upgrading to add it (the Claude Code plugin gets it from `hooks/hooks.json`); `anotifier uninstall` removes the hook and deletes `turns.json` (with its lock and any leftover temp file). Until it is wired, nothing is timed and nothing is filtered.
- **Your own sound files.** `events.<event>.toastSound` can now be the path of an audio file: `~/sounds/done.wav`, an absolute path, any value with a `/` or a backslash, or a name ending in `.wav`, `.mp3`, `.aiff`, `.aif`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus` or `.flac`. It plays in the background and the toast itself is silent: `.wav` and Windows Media formats on Windows (capped at 30 seconds), `afplay` on macOS, `pw-play`/`paplay`/`aplay` on Linux (the only sound Linux plays), Windows playback under WSL. A missing file leaves the default sound (Windows and macOS) and a player that cannot start is logged, both without the path; a file a player cannot decode stays silent on macOS and Linux. `anotifier config sounds` checks the file exists, `anotifier test toast` plays it, and `anotifier doctor` warns about a missing one.
- **Per-project overrides.** New `projects` list in `~/.anotifier/config.json`: each rule has an absolute or `~/` `match` (a folder, or a glob such as `~/work/*/app`; a rule whose `match` is relative, such as `foo`, `./app` or `C:foo`, is rejected and ignored, and a hook folder that is not absolute, such as `foo`, `./app`, `~/x` or `C:foo`, matches no rule) and overrides the channel (`ntfy`, `toast`, `terminalBell`, `webhook`), sound, priority, `minDurationSeconds`, `quietHours`, per-event settings or source labels for hooks run in that folder or anything inside it. Rules are applied once per hook run, before quiet hours, the minimum duration filter and routing, so all of them see the same settings; a run with no folder in its hook input, or no matching rule, behaves exactly as before. If applying the rules ever fails, the error is written to `~/.anotifier/errors.log` (context `config:projects`) and the hook carries on with your top-level settings. Rules live only in your own config file, never in a per-repo file, so a cloned repository cannot redirect your alerts. A Telegram rule that sets `format` inherits `chatId` from the top-level `webhook`. `sentry`, `updateCheck`, `telemetry` and `usageAlerts` cannot be overridden. `anotifier status`, `doctor` and `config` still show your top-level settings only. The statusline's context and usage-limit warnings apply them too, using the folder the session is in at each statusline refresh, from Claude Code's statusline input (`workspace.current_dir`, then `workspace.project_dir`, then `cwd`): a matching rule's `contextAlerts` (`enabled`, `threshold`) changes the context warning for that session only, and its `ntfy`, `toast`, `webhook` and `quietHours` change how both warnings are delivered. The usage-limit warning is account-wide with one shared state, so its thresholds and on/off switch stay global (`usageAlerts` is still not allowed in a rule). A rule that turns every channel off leaves the usage warning to your other chats. See the README section "Per-project overrides".

### Fixed

- **Cursor alerts now read Cursor's own hook input.** Cursor sends `workspace_roots`, `conversation_id` and, on the `stop` hook, a `status` (`completed`, `aborted` or `error`); the hook read none of them. Now the first workspace root names the project, so a Cursor alert shows `my-app · Cursor` in its title and a Windows click on the toast can focus the right window. The conversation id is the session id, so the double-fire guard is per conversation instead of one global lock: two chats finishing within 1.5 seconds both alert. A run that **errored** now says `Task failed` (with the `warning` ntfy tag instead of the check) rather than "Task complete", still under your `events.task_complete` settings. The failed-run alert uses the `warning` ntfy tag in place of whatever `events.task_complete.ntfyTags` is set to. A run you **aborted** sends no alert at all, since you stopped it at the keyboard. Each field is used only when present and well-typed, and only for Cursor (other agents' payloads are read exactly as before); a payload without them alerts exactly as before. Windows Cursor sends workspace roots like `/C:/Users/x/app`; only the folder name (`app`) is used. Hook input that starts with a UTF-8 byte-order mark, which Cursor on Windows can send, is now parsed instead of being dropped as malformed. Nothing to re-run: setup already wires the `stop` hook.

### Changed

- **Cursor’s official app icon** replaces the old cube icon (`assets/icons/cursor.png`), shown on Windows and Linux notifications, in the README and on the site.
- **Message text for webhook and ntfy consumers.** A "task complete" message can now end with `(took …)` once the timing hook is wired, and Cursor alerts are titled `my-app · Cursor`, say `Task failed` when the run errored and send nothing for an aborted run. Anyone matching message text exactly should update.

## [1.7.1] — 2026-10-10

### Changed

- **session_start is now off on the webhook by default**, like every other channel. The default config already turned off the toast, ntfy and the terminal bell for a new session, but not the webhook, so anyone with a webhook enabled (Slack, Discord, Telegram, generic) got a "session started" post on every new agent session. Your config is deep-merged over the defaults: if you never set `events.session_start.webhookEnabled`, those posts stop after you upgrade; if you set it to `true`, nothing changes. To get them back, add `"events": { "session_start": { "webhookEnabled": true } }` to `~/.anotifier/config.json` (the `anotifier config` prompts have no per-event webhook setting).

### Fixed

- On Windows, a usage or context warning lock released by another chat at the same moment is no longer logged as an EPERM error in `anotifier status`.

## [1.7.0] — 2026-10-10

### Added
- **ntfy fallback server.** New optional `ntfy.fallbackServer`: when the main
  `ntfy.server` fails (unreachable, timed out, or an error such as a 429 daily
  limit), the same push goes once to the fallback, same topic. Run your own ntfy
  server and keep `https://ntfy.sh` as the fallback, so a push is not lost when
  either one is down or over its limit. With a fallback set each attempt waits
  at most 3 s (instead of 5 s) so both fit in the hook budget. A fallback failure
  is logged as `ntfy:fallback`; `anotifier status` shows the fallback, and
  `anotifier test ntfy` warns when only the fallback delivered.

### Fixed
- **ntfy timeout is a real deadline.** Each ntfy send now gives up after its
  timeout in total (DNS, connect and response). The old socket idle timer
  could be kept alive by a server sending a byte at a time.

## [1.6.1] — 2026-10-10

### Changed
- **Windows toast failures say why.** A failed Windows toast used to be logged
  as `Command failed: pwsh ... toast.ps1 ...`, which reads the same for a
  timeout, a non-zero exit and a missing pwsh. `anotifier status` now shows the
  cause (`timed out after 7000 ms`, `exit code 3`, `pwsh not found`), and the
  error log keeps the exit code, signal, elapsed time and stderr.

### Fixed
- **Per-model `"auto"` auto-compact window.** A `modelSettings.<model>.autoCompactWindow`
  of `"auto"` (the window Claude Code tunes for the model) now means the model's
  own window for the context warning, instead of falling through to a
  top-level `autoCompactWindow` number that Claude Code does not apply to that
  model.
- **No false lock errors on Windows.** Two chats refreshing their statusline at
  the same moment could log `usage-alert:lock EPERM`: Windows reports a lock
  file that is being released as EPERM instead of "already exists". That is now
  treated as the lock being busy and skipped quietly; a real permissions problem
  is still logged.

## [1.6.0] — 2026-10-09

### Added
- **Context warning for Claude Code.** anotifier now sends one notification
  per chat when its context passes 85% of the auto-compact window, so you can
  wrap up or `/compact` before Claude Code compacts on its own. The window is
  resolved from `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, then the `autoCompactWindow`
  setting (`/autocompact`; per-model and top-level, project then user
  settings, clamped to 100K-1M), then the model's own window, and never
  exceeds the model's window. Each chat warns once and never again, even after
  `/compact` (`/clear` starts a new session). It is skipped when auto-compact
  is off, and the `--autocompact` flag and managed settings are invisible to a
  statusline, so the warning can be late or missing there.
  It works with API-key and proxy sessions too (no subscription limits needed),
  goes to your toast, ntfy and webhook channels, and is held back by snooze and
  quiet hours like the usage warnings. Configure or turn it off with the new
  `contextAlerts` block (`enabled`, `threshold`); `anotifier status` shows it.

## [1.5.0] — 2026-10-09

### Added
- **Usage-limit warnings for Claude Code.** anotifier now warns you before a
  Claude Code usage limit stops you: one notification when the 5-hour or the
  weekly window crosses 70%, 85% and 95% (priority default, high, urgent),
  naming the chat and when the window resets. Limits are account-wide, so each
  threshold warns once per window across all your chats. It needs a Claude.ai
  Pro/Max plan (Claude Code only reports usage to those) and goes to your
  toast, ntfy and webhook channels, held back by snooze and quiet hours.
  `anotifier setup` routes Claude Code's statusline through
  `src/statusline.mjs`, wrapping your own statusline if you have one, and
  `anotifier uninstall` restores it exactly. Configure or turn it off with the
  new `usageAlerts` block (`enabled`, `thresholds`); `anotifier status` shows
  it. Plugin-only installs wire the statusline by hand (see the README).
- **Where to get help.** `anotifier --help` prints the anotifier Discord
  invite, and `anotifier doctor` points there whenever a check warns or fails
  (`doctor --json` is unchanged). The README has a Community section.

## [1.4.0] — 2026-10-08

### Added
- **Antigravity CLI support.** Google moved Google AI Pro/Ultra and free
  Code Assist users from Gemini CLI to Antigravity CLI on June 18,
  2026, and it ignores the hooks anotifier writes to `~/.gemini/settings.json`.
  `anotifier setup` now detects it (`~/.gemini/antigravity-cli`) and adds an
  `anotifier` group with a `Stop` handler to `~/.gemini/config/hooks.json`,
  merging beside your own groups and backing the file up first. A finished run
  sends the usual "Task complete" alert, titled `<project> · Antigravity`.
  `anotifier uninstall` removes only that group, and `status` reports it.
  The handler always answers `{"decision":"stop"}`, so it can never keep the
  agent running. Antigravity has no notification or permission event, so there
  is no "needs input" alert for it. Hook wiring and payload parsing are
  unit-tested against Google's hooks documentation; there is no live
  Antigravity CLI lane in CI yet.

### Fixed
- **Claude notifications that don't need you are no longer urgent.** The
  Claude Code `Notification` hook is registered for every notification type,
  and anotifier never read the payload's `notification_type`, so a completed
  login (`auth_success`), a finished background agent (`agent_completed`), an
  answered MCP form (`elicitation_response`) and any newer type all went out
  as the urgent "Needs your input" alarm. anotifier now routes on the type:
  `permission_prompt` is urgent and says "Needs your permission";
  `elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input` and
  `quota_auto_resume_stale` stay urgent "Needs your input" (or "Needs you to
  resume"); `idle_prompt` gets the quieter idle-reminder treatment by type
  instead of by wording; `agent_completed` and the other `quota_auto_resume_*`
  types become a `default`-priority notice with an info tag; `auth_success`,
  `elicitation_response` and `elicitation_complete` send nothing; and an
  unrecognized type is an urgent "Needs your attention" (a type added by a
  future Claude Code release may be waiting on you, so it fails loud).
  Payloads with no `notification_type` (older Claude Code) are routed exactly
  as before. Opt-in usage stats count the silent runs as a new `skipped`
  outcome.
- **Toasts on a machine with no toast backend.** `anotifier setup` used to warn
  that `notify-send` (Linux), PowerShell 7 / BurntToast (Windows) or Windows
  PowerShell interop (WSL) was missing but leave the toast channel on, so every
  run then failed the toast silently while bell and ntfy delivered. Setup now
  turns the toast channel off (`toast.enabled: false`, recorded as
  `toast.disabledBySetup: true`) and prints what to install. Re-running
  `anotifier setup` once the backend exists turns toasts back on; toasts you
  turned off yourself are left off. `anotifier status` and `anotifier doctor`
  show "toast: off, no backend (<what to install>)". Only a definite miss turns
  toasts off: a probe that times out (a slow PowerShell start, say) leaves toasts
  on, in interactive and non-interactive setup runs alike. The Linux check also
  no longer depends on the `which` binary being installed.

### Security
- **`config.json` is owner-only.** The config can hold webhook URLs (which are
  credentials), the ntfy topic and the Sentry DSN, but it was written with the
  default umask, leaving it world-readable (0644) on macOS and Linux. It is now
  written with mode 0600, and a newly created `~/.anotifier` directory is 0700.
  Existing files are tightened the next time the config is saved.

## [1.3.1] — 2026-10-06

### Fixed
- **Plain output off a terminal.** When stdout is not a terminal (piped, CI
  logs, or an agent running `npx anotifier setup` through its shell tool) the
  CLI now prints plain text instead of 24-bit colour escapes, and the setup
  spinner prints only its result line instead of a run of animation frames.
  `NO_COLOR` forces plain text and `FORCE_COLOR` forces colour.
- **Banner.** `anotifier --help` showed the pre-rename "AI Notify" ASCII art; it
  now spells anotifier.

## [1.3.0] — 2026-10-06

### Added
- **Documentation URL.** `anotifier --help` and the end of `anotifier setup` now
  point at the full reference at `https://anotifier.io/docs/` instead of the
  bare home page.
- **Support link.** `package.json` carries the npm-standard `funding` field
  (`npm fund` surfaces it), the repo has a `.github/FUNDING.yml`, and the CLI
  prints a single muted line — "consider supporting it" — at the end of
  `anotifier setup` and `anotifier status`, plus a footer line in `--help`. The
  URL lives in exactly one place (`src/support.mjs` reads `funding.url`). It is
  never printed on the hook path, never inside a notification, and never in
  `doctor --json`.
- **Star ask after setup.** A successful `anotifier setup` ends with one muted
  line pointing at the GitHub repo ("A GitHub star helps other developers find
  anotifier"). It appears only there — not in `status`, `--help`, `doctor`, the
  hook path, or any notification. The URL comes from package.json
  `repository.url`.
- **Opt-in anonymous usage stats.** Off unless you say yes. The first
  `anotifier setup` run in an interactive terminal asks (default Yes); a setup
  that is piped, driven by an agent (`/anotifier:setup`), or whose input closes
  never asks and leaves stats off, and re-running setup never overrides a choice
  you already made. `anotifier telemetry [on|off]` shows or changes the choice,
  prints your install id and the exact counts waiting to be sent, and `off`
  deletes the local install id and pending counts. CLI commands send their name,
  clamped argument shape, exit code, duration and per-channel results in one
  request; hook runs are only counted locally and sent as one summary a day
  (outcomes per agent, event and channel, skip reasons, unrecognized hook event
  names clamped to 40 safe characters and capped at 10, a latency bucket, and
  which features are on). The README lists every event and property. Message
  text, project names, paths, ntfy topics and servers, webhook URLs, hostnames
  and error messages are never sent. Data goes to the project's self-hosted
  PostHog (posthog.devino.ca), keyed by a random install id, with geolocation
  disabled; the server discards client IP addresses. To delete what was sent,
  open a GitHub issue with your install id. Off by default in `config.json` (so
  plugin-only installs send nothing), and forced off by `DO_NOT_TRACK=1`,
  `ANOTIFIER_TELEMETRY=0` or CI. The hook waits at most 0.8s for the server (the
  network send only; the small local counter file is updated in place and is
  not part of that wait) and the CLI at most 1s.

### Fixed
- **WSL is reported as WSL.** `anotifier setup`, `status` and `doctor` described
  WSL as plain Linux and checked for `notify-send`, which WSL never uses. They
  now name the Windows-interop toast path, and `doctor` checks for `wslpath`
  and a reachable Windows PowerShell instead.
- **WSL toast failures are logged.** When no Windows PowerShell could be reached
  through interop, the toast failed silently. It now writes a `toast:wsl` entry
  (naming each executable tried) to the hook error log that `status` shows.
- **`doctor` no longer passes with only Windows PowerShell 5.1.** Toasts are
  spawned through PowerShell 7 (`pwsh`), so 5.1 alone now fails the toast check
  with a `winget` install hint, and `setup` says so instead of reporting a
  BurntToast install failure.
- **`uninstall` removes the `agentfocus://` protocol** that click-to-focus
  registers under `HKCU\Software\Classes`, but only when it still points at
  anotifier's `focus.vbs`.
- **The generated ntfy topic uses `crypto.randomInt`** instead of `Math.random`.
  The topic is what keeps a public ntfy.sh topic private.

## [1.2.6] — 2026-09-10

### Fixed
- **Notifications name the project again.** The project name lived only in the
  body prefix (`my-app: Task complete`), and rich content — on by default for
  toasts and webhooks — replaces the whole body with the assistant's actual
  words. So a desktop toast read "Claude Code" plus a chat snippet, with no clue
  *which* project had finished; with several agents running in different repos
  that made toasts nearly useless. The project name now leads the **title** on
  every channel (`my-app · Claude Code`), where nothing rewrites it. The body
  is unchanged, byte for byte; events with no project keep the bare label.
- **ntfy titles with non-ASCII characters are RFC 2047-encoded.** HTTP headers
  are bytes, so the new `·` separator — and any non-ASCII project directory
  name — would have arrived as mojibake or thrown before the push was sent.
  ntfy decodes the `=?UTF-8?B?…?=` form server-side; pure-ASCII titles are
  sent exactly as before.

## [1.2.5] — 2026-08-04

### Changed
- **Claude's idle "waiting for your input" reminder no longer pings at urgent
  priority.** About a minute after a turn ends, Claude Code fires a second
  Notification whose text is an idle nag, not a real request — nobody is
  blocked. Routed as a plain `needs_input`, it earned the urgent-priority
  "Needs your input" push (alarm tags and all) that exists for genuine
  permission prompts, so every task you walked away from ended in the loudest
  ping the product can send. The reminder now goes out at `default` priority
  with an hourglass tag; it keeps its channels, title, and rich body — it just
  stops shouting. Real permission prompts are untouched, byte-identical.
  Detection matches Claude's own reminder copy and deliberately fails toward
  loud: if that copy ever drifts, the nag goes back to urgent rather than a
  permission prompt ever going quiet. `events.needs_input.idleReminderPriority`
  is the escape hatch to tune it (`urgent` restores the old behavior, `min`
  makes it near-silent).

## [1.2.4] — 2026-08-03

### Fixed
- **"Task complete" no longer fires while background work is still running.**
  Claude Code's `Stop` hook fires when the main agent's *turn* ends — which is
  seconds after it dispatches background subagents or long background shell
  commands, minutes before the work actually finishes. anotifier pinged "Task
  complete" at that first moment. The `Stop` payload carries Claude Code's own
  pending-work ledger (`background_tasks`, verified against the live CLI); the
  hook now holds the ping back while any entry is still running and lets the
  final `Stop` — the one whose ledger is drained — deliver the real "Task
  complete". Self-correcting by design: Claude Code re-invokes the agent when
  background work finishes, so that final `Stop` always arrives. Unknown ledger
  shapes count as still-running (a premature ping misleads; a held-back one
  self-corrects), and older Claude Code versions without the field — plus every
  other tool — keep exactly today's behavior. Claude-only: Cursor's
  `subagentStop` ping is per-subagent by design and is untouched.

## [1.2.3] — 2026-08-03

### Added
- **Update notifications through your own channels.** When a newer anotifier is
  published, the notify hook announces it **once per version** through whichever
  channels you already have enabled (toast / ntfy / webhook — never the terminal
  bell), with the upgrade command and a link to the release notes (ntfy gets it
  as the tap target). At most one registry check per 24h, sharing the CLI
  banner's cache; the whole check is hard-capped and fail-open so it can never
  delay or fail a hook run. Opt out with `updateCheck.enabled: false`.
- **`anotifier snooze <duration>`.** Silence every channel for `30m`, `2h`,
  `90s`, or a bare number of minutes; `snooze off` cancels early, bare `snooze`
  reports the current state. Also available as the `/snooze` plugin command.
- **Quiet hours.** `quietHours: { "enabled": false, "from": "22:00", "to": "08:00" }`
  silences every channel during a recurring local-time window (midnight-spanning
  windows supported). A malformed time disables the block entirely rather than
  falling back to a default window — a typo must never silence you by surprise.
- **Snooze and quiet-hours rows in `anotifier status`.**

### Fixed
- **Stale CLI update banner.** After upgrading, `anotifier` commands could show
  `vX → vX` ("update available" to the version already installed) for up to 24h,
  because the cached `latest` was trusted without re-checking. Both call sites
  now re-assert the version comparison.

### Changed
- **Docs & community.** The README documents the real Claude Code plugin install
  two-step (`/plugin marketplace add` + `/plugin install anotifier@anotifier`)
  and gains a hero image; added SECURITY.md, CONTRIBUTING.md, and GitHub issue
  forms; `anotifier --help` and setup now point to https://anotifier.io.

## [1.2.2] — 2026-07-20

Release-infrastructure only — **no functional or behavioral changes from 1.2.1**;
the package contents are identical.

### Changed
- **First release published via tokenless CI with provenance.** 1.2.1 was
  published manually to bootstrap the new `anotifier` package name — npm requires
  a package to exist before a Trusted Publisher can be configured — so it carries
  no build provenance. 1.2.2 is the first release cut through GitHub Actions using
  npm Trusted Publishing (OIDC), so the published artifact now ships with a
  verifiable provenance attestation, and no npm token is involved at any point.

## [1.2.1] — 2026-07-16

**First release published to npm since 1.0.6.** Everything in 1.1.0 and 1.2.0
below ships to npm users for the first time with this release.

### Renamed
- The package is now **`anotifier`** (was `ai-agent-notifier`), the CLI command
  is now **`anotifier`**, the config directory is now **`~/.anotifier`** (was
  `~/.ai-agent-notifier`), and the project home is **https://anotifier.io**. The
  repository was renamed to `anotifier-for-claude-codex-cursor`.
- **Upgrading from `ai-agent-notifier`?** Re-run setup — `npx anotifier@latest
  setup` — because the command name and config directory changed. Prior config
  is not auto-migrated; the old `ai-agent-notifier` package is deprecated and
  points here.

### Fixed
- **Linux toasts silently dropped for messages starting with `-`.** `notify-send`
  was invoked positionals-first with no `--` end-of-options guard, so rich
  content beginning with a dash (e.g. an assistant line like `- Fixed the bug`)
  was parsed as an unknown option and the toast never fired. Arguments are now
  options, then `--`, then title/message.
- **`anotifier test ntfy` crashed on a scheme-less server value.** An unguarded
  `new URL()` broke the ntfy sender's resolve-false/never-throw contract; a typo
  like `ntfy.sh` (no `https://`) now degrades cleanly instead of throwing.
- **Update-check nagged a downgrade.** The version comparison used string
  inequality, so a user on 1.2.x was told to "update" to the older npm `latest`.
  It now uses a proper semver comparison.
- **`npm test` never ran on Windows with Node 18/20.** Test globs are expanded
  by the runner itself rather than relying on shell globbing.

### Added
- **Real install one-liners.** `setup/install.sh` and `setup/install.ps1` now
  exist — the README `curl | bash` / `irm | iex` commands previously 404'd and
  silently no-opped. Both preflight Node ≥ 18 + npm, fail loudly, and hand off
  to `npx anotifier@latest setup`.
- **`anotifier doctor --deep` verifies delivery on Linux.** Fires the real toast with
  a unique marker and reads it back out of `dunst`'s own history, degrading
  honestly (dispatched-but-unverified) when no reader daemon is present. The
  win32 backend check is now a real probe (PowerShell + BurntToast + execution
  policy) instead of a hardcoded `ok`.
- **Release pipeline.** Pushing a `v*` tag runs a 3-OS × Node 18/20/22 matrix,
  verifies tag/`package.json`/plugin-manifest lockstep and the `npm pack`
  payload, then publishes with `--provenance` and drafts a GitHub release. CI
  never tags or publishes on its own — the maintainer cuts the tag.

### Changed
- **Honest documentation.** Removed a README claim of a macOS `terminal-notifier`
  fallback that never existed in code; scoped the WSL claims to the
  detection/interop behavior that is actually tested.
- **CI de-duplicated.** Push and pull-request runs no longer double-fire; push
  triggers are restricted to `main`.
- **Hardened live-push assertions.** The live E2E lanes now always log the
  received push and hard-assert the deterministic router body, closing an
  observability gap.

## [1.2.0] — 2026-07-16 — Real-delivery verification

Notifications can fail **silently** — `osascript`/`notify-send`/BurntToast all
exit `0` even when nothing renders. This line replaces "the command exited 0"
with proof of the real user experience, so CI goes red when a real user would
have seen nothing.

### Added
- **macOS:** a fired notification is read back out of Notification Center's own
  SQLite database and matched to the exact payload (layer 2 — OS store recorded).
- **Linux:** layer-3 render proof — the notification text is OCR-verified as
  legible pixels on a real X display, not just recorded by the daemon.
- **Windows:** layer-2 proof — the toast is read back out of `wpndatabase.db`
  with the exact nonce in its title and body, promoting the lane from exit-0.

## [1.1.0] — 2026-07-10

Five features selected from a verified user-demand research pass, plus a second
audit pass hardening observability and the CLI.

### Added
- **Terminal bell channel** via `terminalSequence` — the hook reply carries a
  bell that Claude Code (≥ 2.1.141) rings through its own terminal write path,
  fixing the silent `/dev/tty` failure after hooks lost their TTY.
- **Codex approval alerts** — registers the `PermissionRequest` hook event so
  Codex approval prompts raise a notification.
- **Transcript-derived rich content** — toasts and webhooks can show the
  assistant's actual question or last message (bounded, sanitized). ntfy stays
  generic by default, since public ntfy.sh topics are guessable — rich content
  there is opt-in.
- **WSL toast delivery** — notifications from inside WSL surface on the Windows
  host.
- **Webhook channel** — deliver notifications to an arbitrary HTTP endpoint.

### Changed
- Every hook failure now lands in a bounded `errors.log` (surfaced by `status`,
  optionally mirrored to Sentry via a zero-dependency client), config keys
  renamed to what they mean with validation and migration hints, SHA-pinned CI
  actions, and a ~50× smaller npm package.

## [1.0.6] — 2026-06-19

Previous release published to npm. Baseline for the changes above.
