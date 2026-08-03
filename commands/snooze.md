---
name: snooze
description: Silence every anotifier channel for a while
---

Pause notifications. Execute this in the terminal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/index.mjs" snooze 30m
```

This silences every channel — toast, ntfy push, webhook, and terminal bell — until the deadline passes. Durations are `30m`, `2h`, `90s`, or a bare number of minutes (`45`). Run it with no duration to see the current state, or `snooze off` to cancel early.
