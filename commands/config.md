---
name: config
description: Open the interactive settings menu to configure notifications
---

Open the anotifier interactive configuration menu. Execute this in the terminal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/index.mjs" config
```

Sections: `ntfy` (push notification settings), `webhook` (Slack/Discord/Telegram/generic endpoint), `sounds` (per-event `toastSound`: a sound name, or the path of your own audio file), `events` (per-event overrides), `sentry` (opt-in error reporting).

Per-project rules (the `projects` list) are not part of this menu: they change settings for chosen folders and are edited in `~/.anotifier/config.json`. They never apply here; the menu shows and saves your top-level settings. See "Per-project overrides" in the README.
