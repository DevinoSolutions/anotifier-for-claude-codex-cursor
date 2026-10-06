import type { Guide } from "./guides";
import { WINDOWS_SOUND, json } from "./claude-guides";

/**
 * Codex CLI deep dive: sounds and approval alerts. Codex facts follow its docs
 * (developers.openai.com/codex/config-advanced and /codex/hooks) and the
 * openai/codex source at rust-v0.157.1 (tui/src/notifications,
 * tui/src/chatwidget/notifications.rs, config/src/types.rs); anotifier facts
 * are checked against the package source for the version in lib/site.ts.
 */

const soundHook = (macSound: string, windowsFile: string) => ({
  hooks: [
    {
      type: "command",
      command: `afplay /System/Library/Sounds/${macSound}.aiff`,
      commandWindows: WINDOWS_SOUND(windowsFile),
      async: true,
    },
  ],
});

export const CODEX_GUIDES: Guide[] = [
  {
    slug: "codex-notification-sound",
    updated: "2026-10-06",
    kind: "topic",
    agentSlug: "codex",
    name: "Codex CLI sounds",
    icon: "/assets/icons/codex.png",
    title: "Codex CLI Notification Sound: Ding When Done or Waiting",
    description:
      "By default Codex alerts you only in the background. Set notification_condition = \"always\" under [tui] in ~/.codex/config.toml, or play a sound with a hook.",
    h1: "Make Codex CLI ding when it needs your approval or a response",
    intro:
      'Codex CLI already notifies you when it needs approval or a response from you, but by default only while its terminal is in the background, and in some terminals as a silent banner. Under `[tui]` in `~/.codex/config.toml`, set `notification_condition = "always"` to be alerted even when the window is in front, and `notification_method = "bel"` to get the terminal bell instead of a banner. For a real sound file, add a `PermissionRequest` hook that plays one. Here are both, plus how to ding only when Codex is waiting on you.',
    sections: [
      {
        id: "builtin",
        title: "Codex already dings, but only in the background",
        blocks: [
          {
            kind: "p",
            text: "The Codex TUI has notifications built in, and they are on by default. Codex sends one when a turn ends, when it asks to run a command or edit files, when an MCP server asks for approval, and when a Plan mode prompt or a question is waiting for your answer. Two defaults decide whether you notice:",
          },
          {
            kind: "ul",
            items: [
              "**Only while the terminal is unfocused.** `notification_condition` defaults to `unfocused`, so nothing fires while the Codex window is in front.",
              "**Banner or bell depends on the terminal.** `notification_method` defaults to `auto`: an OSC 9 desktop notification in terminals Codex knows support it, and the terminal bell (BEL) everywhere else.",
            ],
          },
          {
            kind: "table",
            head: ["Terminal", "`auto` sends", "What you get"],
            rows: [
              [
                "Ghostty, iTerm2, Kitty, Warp, WezTerm",
                "OSC 9",
                "A desktop notification from the terminal app. Whether it plays a sound follows your OS notification settings for that app",
              ],
              [
                "Apple Terminal, Windows Terminal, VS Code, GNOME Terminal, Konsole, Alacritty, and the rest",
                "BEL",
                "Whatever the terminal does with its bell: a beep, a visual flash, or nothing if the bell is muted",
              ],
            ],
          },
        ],
      },
      {
        id: "config",
        title: "The config: ding for approvals, even in the foreground",
        blocks: [
          {
            kind: "p",
            text: "Put this in `~/.codex/config.toml`. The list limits notifications to the ones that wait on you, `bel` forces the terminal bell, and `always` drops the unfocused-only rule:",
          },
          {
            kind: "code",
            lang: "toml",
            code: '[tui]\nnotifications = ["approval-requested", "plan-mode-prompt", "async-question"]\nnotification_method = "bel"\nnotification_condition = "always"',
          },
          {
            kind: "table",
            head: ["Type", "Fires when"],
            rows: [
              [
                "`agent-turn-complete`",
                "A turn ends. The notification previews Codex's reply",
              ],
              [
                "`approval-requested`",
                "Codex asks to run a command or edit files, or an MCP server asks for approval",
              ],
              ["`plan-mode-prompt`", "A Plan mode prompt is waiting for you"],
              ["`async-question`", "Codex has asked you a question"],
            ],
          },
          {
            kind: "note",
            text: "`notifications = true`, the default, allows every type, and `false` turns them all off. There is no `none` method, so use `notifications = false` to silence Codex. The type names come from Codex CLI 0.157; Codex ignores a name it doesn't know, so an older version simply never matches the newer ones.",
          },
        ],
      },
      {
        id: "hook",
        title: "Play a real sound: a PermissionRequest hook",
        blocks: [
          {
            kind: "p",
            text: "The bell is only as loud as your terminal makes it. For a sound file, use Codex hooks: `PermissionRequest` runs when Codex is about to ask for approval, and only then, and `Stop` runs when the turn ends. Add this to `~/.codex/hooks.json` to hear Glass when Codex finishes and Ping when it needs you on macOS. The `commandWindows` override plays Windows sounds instead:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [soundHook("Glass", "chimes.wav")],
                PermissionRequest: [soundHook("Ping", "notify.wav")],
              },
            }),
          },
          {
            kind: "ul",
            items: [
              '`"async": true` tells Codex not to wait for the sound. Without it, Codex holds the approval prompt until the hook exits.',
              "On Linux, change each `command` to `paplay` with a freedesktop sound from `/usr/share/sounds/freedesktop/stereo/`, such as `complete.oga` for `Stop` and `message-new-instant.oga` for approvals. It needs PulseAudio or PipeWire.",
              "Codex skips new or changed hooks until you trust them. Open `/hooks` in Codex to review and trust these two; Codex warns at startup when hooks are waiting for review.",
              "Hooks are on by default in current Codex releases. If you turned them off, set `hooks = true` under `[features]` in `config.toml`.",
              "Sound players print nothing, and Codex treats a hook that exits 0 with no output as a success, so the hook never changes what Codex does.",
            ],
          },
          {
            kind: "note",
            text: "A hook runs on the machine where Codex runs. Over SSH, `afplay` or `paplay` plays on the remote machine. The `[tui]` bell and OSC 9 notification are terminal output, so they reach the terminal you are sitting at.",
          },
        ],
      },
      {
        id: "notify",
        title: "Why notify can't ding on approvals",
        blocks: [
          {
            kind: "p",
            text: "The `notify` setting runs your own program, but Codex currently sends it only one event, `agent-turn-complete`. It never fires for an approval prompt. Codex also ignores `notify` in a project's `.codex/config.toml`, so set it in `~/.codex/config.toml`. Use it for a finished-turn sound or webhook, and one of the options above for approvals.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "Sounds and phone alerts with anotifier",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "anotifier registers Codex's `Stop` and `PermissionRequest` hooks for you and sends each event to your desktop and, if you set it up, your phone. An approval request arrives as an urgent needs-input alert with the `Reminder` sound (Ping on macOS). A finished turn plays `IM` (Glass on macOS). Change either with `toastSound`:",
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
            text: "anotifier also rings the terminal bell by default. If Codex's own `[tui]` bell fires too, you may hear two; turn one off with `terminalBellEnabled: false` in anotifier or `notifications = false` under `[tui]`. The [Claude Code sound guide](/guides/claude-code-notification-sound/#anotifier) lists every sound name per platform; they are the same for Codex.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I make Codex ding when it needs approval?",
        a: 'Under [tui] in ~/.codex/config.toml, set notifications = ["approval-requested"], notification_method = "bel" and notification_condition = "always". Or add a PermissionRequest hook to ~/.codex/hooks.json that plays a sound file.',
      },
      {
        q: "Can Codex ding when a Plan mode prompt or a question needs my response?",
        a: 'Yes. Those are the plan-mode-prompt and async-question notification types. Keep them in the [tui] notifications list with notification_method = "bel" and notification_condition = "always". A PermissionRequest hook fires only for approvals, so use the [tui] setting for prompts and questions.',
      },
      {
        q: "Why doesn't Codex make a sound?",
        a: "By default Codex notifies only while its terminal is unfocused, and in Ghostty, iTerm2, Kitty, Warp and WezTerm it sends a desktop notification instead of ringing the bell. Also check that your terminal's bell isn't muted and that notifications isn't set to false under [tui].",
      },
      {
        q: "Can Codex play a sound when it finishes?",
        a: "Yes. Keep agent-turn-complete in the [tui] notifications list, or add a Stop hook that plays a file. The notify setting also fires on agent-turn-complete and can run any script.",
      },
      {
        q: "Does a sound hook slow Codex down?",
        a: 'Not with "async": true. Without it, Codex waits for the hook, so the approval prompt appears only after the sound finishes.',
      },
    ],
  },
];
