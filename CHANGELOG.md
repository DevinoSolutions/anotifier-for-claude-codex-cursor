# Changelog

All notable changes to `anotifier` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

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
