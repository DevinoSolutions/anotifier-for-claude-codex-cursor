import type { Guide } from "./guides";
import { json } from "./claude-guides";

/**
 * Antigravity CLI notifications. Antigravity facts follow Google's docs, read
 * 2026-10-16 against CLI 1.4.0: the hooks page (antigravity.google/docs/hooks:
 * file locations, events, the Stop payload and {"decision": ...} reply), the
 * settings page and CLI reference (the `notifications` setting), and the CLI
 * release notes (1.3.1). Google documents no hook exit codes, no failure
 * behavior and no Windows shell, and the copy says so instead of guessing.
 * anotifier facts mirror the released 1.7.1 package (setup/patch-config.mjs
 * patchAntigravity, src/parse-input.mjs, src/notify.mjs defaultResponseBody,
 * cli/setup.mjs, config/default-config.json). anotifier has not been run
 * against a live Antigravity CLI, and the copy says so.
 */

const STOP_REPLY = '{"decision":"stop"}';

const hookConfig = (command: string) =>
  json({ notify: { Stop: [{ type: "command", command, timeout: 10 }] } });

const SETTINGS_JSON = json({ notifications: true });

const HOOK_SHAPE = json({
  "hook-name": {
    enabled: true,
    PostToolUse: [
      {
        matcher: "run_command",
        hooks: [{ type: "command", command: "./scripts/lint.sh", timeout: 10 }],
      },
    ],
    Stop: [{ type: "command", command: "./scripts/after-run.sh" }],
  },
});

const STOP_STDIN = json({
  conversationId: "7f3c0b1e",
  workspacePaths: ["/home/you/my-app"],
  transcriptPath: "/path/to/transcript",
  artifactDirectoryPath: "/path/to/artifacts",
  modelName: "your-model",
  executionNum: 1,
  terminationReason: "model_stop",
  fullyIdle: true,
});

const MAC_SCRIPT = `#!/bin/sh
cat > /dev/null
osascript -e 'display notification "Run finished" with title "Antigravity CLI"'
afplay /System/Library/Sounds/Glass.aiff
echo '${STOP_REPLY}'
exit 0`;

const LINUX_SCRIPT = `#!/bin/sh
cat > /dev/null
notify-send 'Antigravity CLI' 'Run finished'
paplay /usr/share/sounds/freedesktop/stereo/complete.oga
echo '${STOP_REPLY}'
exit 0`;

const WIN_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $xml.GetElementsByTagName('text')
$null = $texts.Item(0).AppendChild($xml.CreateTextNode('Antigravity CLI'))
$null = $texts.Item(1).AppendChild($xml.CreateTextNode('Run finished'))
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
(New-Object Media.SoundPlayer 'C:/Windows/Media/chimes.wav').PlaySync()
'${STOP_REPLY}'
exit 0`;

const NTFY_SH = `curl -s -o /dev/null -d 'Antigravity run finished' -H 'Title: Antigravity CLI' https://ntfy.sh/your-topic`;
const NTFY_PS1 = `curl.exe -s -o NUL -d 'Antigravity run finished' -H 'Title: Antigravity CLI' https://ntfy.sh/your-topic`;

const AGY_SRC =
  "https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/blob/v1.7.1";

export const ANTIGRAVITY_GUIDES: Guide[] = [
  {
    slug: "antigravity-cli-notifications",
    updated: "2026-10-16",
    kind: "agent",
    agentSlug: "antigravity-cli",
    name: "Antigravity CLI",
    icon: "/assets/icons/gemini.png",
    title: "Antigravity Notifications: CLI Setting, Hooks & Phone Alerts",
    description:
      "Get Antigravity notifications for the CLI, app and IDE: the CLI's built-in notifications setting, or a Stop hook with toast, sound and ntfy phone push.",
    h1: "How to get notified when Antigravity CLI finishes",
    intro:
      'To make Antigravity CLI notify you, set `notifications` to `true` in `~/.gemini/antigravity-cli/settings.json` (or switch it on in `/config`). It sends a desktop notification and a terminal bell chime when a task completes or needs you. For your own toast, sound or phone push, add a `Stop` hook to `~/.gemini/config/hooks.json` that ends by printing `{"decision":"stop"}`. To wire a desktop and phone alert in one go, run `npx anotifier@latest setup`. Here is every option, then [fixes by symptom](#fix). Using the Antigravity app or IDE? Google documents no notifications setting for them, so use the `Stop` hook ([details](#fix)). Coming from Gemini CLI? Its hooks and settings are different; see [Gemini CLI vs Antigravity CLI](#gemini).',
    sections: [
      {
        id: "quick",
        title: "Quick setup: which Antigravity CLI alert do you want?",
        blocks: [
          {
            kind: "table",
            head: ["You want", "Do this"],
            rows: [
              [
                "A desktop notification and a bell, no scripts",
                "Set `notifications` to `true` ([Option 1](#builtin))",
              ],
              [
                "An alert when it asks for permission or a question",
                "The same setting. A hook can't do this: [there is no such event](#hook)",
              ],
              [
                "Your own toast and sound when a run ends",
                "A `Stop` hook that runs a script ([Option 2](#hook), [commands per OS](#toast-sound))",
              ],
              [
                "A push to your phone",
                "The script posts to ntfy ([phone](#phone)), or anotifier",
              ],
              [
                "All of it in one command",
                "`npx anotifier@latest setup` ([Option 3](#anotifier))",
              ],
            ],
          },
        ],
      },
      {
        id: "builtin",
        title: "Option 1: Antigravity CLI's built-in notifications setting",
        blocks: [
          {
            kind: "p",
            text: "Antigravity CLI keeps its persistent settings in `~/.gemini/antigravity-cli/settings.json`, and writes only the values that differ from the defaults. The `notifications` setting is a boolean that defaults to `false`. Turn it on in the file:",
          },
          { kind: "code", lang: "json", code: SETTINGS_JSON },
          {
            kind: "p",
            text: "Or open `/config` (alias `/settings`) inside the CLI and switch Notifications on. Google describes it as a system desktop notification plus a terminal bell chime when a long-running task completes or requires your attention. Since CLI 1.3.1 the CLI also alerts you when the agent stops to ask a question, the same way it does for tool permission prompts. The command you launch the CLI with is `agy`.",
          },
          {
            kind: "p",
            text: "What you get: an alert on the machine running the CLI. Google's docs give no setting for the wording, the sound or a phone push, so for those use a hook. If you run both the setting and a hook, you get two alerts when a run finishes. Separately, CLI 1.4.0 (16 Oct 2026) added terminal status reporting over OSC 7501: in terminals that support it, the tab or window shows whether the CLI is working, waiting for your input, done or failed. It is a status display, not a notification, and `AGY_CLI_OSC7501=off` turns it off.",
          },
        ],
      },
      {
        id: "hook",
        title: "Option 2: a Stop hook in ~/.gemini/config/hooks.json",
        blocks: [
          {
            kind: "p",
            text: "Google's hooks docs let Antigravity CLI read hooks from three places: `.agents/hooks.json` at your project root, `~/.gemini/config/hooks.json` for every project, or the `hooks.json` inside an installed plugin. The global hooks can also sit inside `~/.gemini/antigravity-cli/settings.json`, but the docs don't show the key layout there, so this guide uses `hooks.json`. The docs write every path with `~` and give no separate Windows path, so on Windows it is the same path under your home folder. This guide uses `~/.gemini/config/hooks.json`. Type `/hooks` inside the CLI to see what it loaded.",
          },
          {
            kind: "p",
            text: "The file maps a hook name you choose to its events, plus an optional `enabled` flag (default `true`). `PreToolUse` and `PostToolUse` take entries with a `matcher` and a `hooks` list. `SessionStart`, `PreInvocation`, `PostInvocation` and `Stop` take a list of handlers directly. A handler has a `command` (required), a `type` (only `command` exists) and a `timeout` in seconds, 30 by default. This is the shape, after Google's example:",
          },
          { kind: "code", lang: "json", code: HOOK_SHAPE },
          {
            kind: "table",
            head: ["Event", "Fires when", "Use it for"],
            rows: [
              ["`Stop`", "The execution loop ends", "The run-finished alert"],
              [
                "`SessionStart`",
                "A new conversation session starts, before the first model call",
                "Not for alerts",
              ],
              [
                "`PreToolUse` / `PostToolUse`",
                "Before and after a tool runs",
                "Gating or logging tools, not alerts: they fire on every tool call",
              ],
              [
                "`PreInvocation` / `PostInvocation`",
                "Before and after each model call",
                "Not for alerts: they fire many times per run",
              ],
            ],
          },
          {
            kind: "p",
            text: "Antigravity CLI has no `AfterAgent` or `Notification` event, and no event for a permission prompt, so a hook can tell you a run ended but not that the agent is waiting on you. Use Option 1 for that. `Stop` writes one JSON object to the handler's stdin (field names are camelCase); the values below are illustrative:",
          },
          { kind: "code", lang: "json", code: STOP_STDIN },
          {
            kind: "ul",
            items: [
              "`terminationReason` says why the run stopped. Google's examples are `model_stop`, `max_steps_exceeded` and `error`, so treat the list as open. `error` is present when a system error ended the run.",
              "`fullyIdle` is `true` only when the agent is completely finished and every background command or async task has completed, and `false` while background work is still running. A script can read it, but Google doesn't say whether another `Stop` follows when it is `false`, so skipping the alert on `false` may lose it for good. That is why anotifier alerts on every `Stop`.",
              "`workspacePaths` lists the project folders, so a script can put the project name in the alert.",
            ],
          },
          {
            kind: "p",
            text: 'What `Stop` must print: a JSON object on stdout with a `decision`. `"decision": "continue"` keeps the agent running and re-enters the loop, injecting an optional `reason` as a system message; any other value lets it stop. Google marks `decision` as required, so a notification hook should print `{"decision":"stop"}` and nothing else.',
          },
          {
            kind: "note",
            text: "Google's hooks page documents no exit codes, says nothing about what happens when a handler exits non-zero, prints invalid JSON or times out, and doesn't say which shell runs the `command` on Windows. Don't rely on any of it. Keep the command to a single program call with no `;`, `&&` or `||`, make the script swallow its own errors, and have it always end with the `stop` answer and exit 0. Treat a hook command like any script you run. A project's `.agents/hooks.json` can contain commands, and Google doesn't document whether workspace hooks need your trust first, so put alert hooks in the global file and read a cloned repository's before you open it in the CLI.",
          },
        ],
      },
      {
        id: "toast-sound",
        title: "Antigravity CLI desktop toast and sound by OS",
        blocks: [
          {
            kind: "p",
            text: "Each hook below is a small script that shows the toast, plays the sound and prints the `stop` answer, so the `command` in `hooks.json` stays one program call. The scripts read nothing from the payload. Replace `you` with your user name.",
          },
          {
            kind: "p",
            text: "**macOS.** Save as `~/.gemini/hooks/notify.sh`. `osascript` notifications are attributed to Script Editor, and if Script Editor isn't allowed to send notifications the toast silently fails. `afplay` plays any `.aiff`, `.mp3` or `.wav`.",
          },
          { kind: "code", lang: "bash", code: MAC_SCRIPT },
          {
            kind: "code",
            lang: "json",
            code: hookConfig("sh /Users/you/.gemini/hooks/notify.sh"),
          },
          {
            kind: "p",
            text: "**Linux.** Same file name, with `notify-send` and `paplay`. `notify-send` needs a desktop notification daemon, which servers, containers and SSH sessions without a desktop lack, and `paplay` needs PulseAudio or PipeWire with the freedesktop sound theme.",
          },
          { kind: "code", lang: "bash", code: LINUX_SCRIPT },
          {
            kind: "code",
            lang: "json",
            code: hookConfig("sh /home/you/.gemini/hooks/notify.sh"),
          },
          {
            kind: "p",
            text: "**Windows.** Save as `C:\\Users\\you\\.gemini\\hooks\\notify.ps1`. It needs no module, runs on Windows PowerShell 5.1, and is the same toast as in the [WSL toast guide](/guides/wsl-notify-send/). `PlaySync` waits for the chime to end so PowerShell doesn't exit first; any `.wav` in `C:\\Windows\\Media` works. In the JSON, write the path with forward slashes so it needs no backslash escapes:",
          },
          { kind: "code", lang: "powershell", code: WIN_SCRIPT },
          {
            kind: "code",
            lang: "json",
            code: hookConfig(
              "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:/Users/you/.gemini/hooks/notify.ps1",
            ),
          },
          {
            kind: "ul",
            items: [
              "Run `chmod +x` on the shell script, or keep the `sh` in front of the path as above.",
              "The Windows toast shows under the name Windows PowerShell, with no Antigravity icon or click-to-focus. If nothing appears, Do not disturb (Focus Assist) may be on.",
              "A hook runs on the machine where `agy` runs. Over SSH, `notify-send` and `afplay` act on the remote machine, so use [phone push](#phone) there.",
            ],
          },
        ],
      },
      {
        id: "phone",
        title: "Antigravity CLI alerts on your phone with ntfy",
        blocks: [
          {
            kind: "p",
            text: "[ntfy](https://ntfy.sh) is a free, open-source push service with Android and iOS apps and no account. Install the app, subscribe to a long random topic name, and add one line to the script, before the `stop` answer. `-s -o` keeps curl's reply off the hook's stdout, where only the `stop` JSON belongs. On macOS and Linux:",
          },
          { kind: "code", lang: "bash", code: NTFY_SH },
          {
            kind: "p",
            text: "On Windows use `curl.exe`, because `curl` is an alias for `Invoke-WebRequest` in Windows PowerShell 5.1:",
          },
          { kind: "code", lang: "powershell", code: NTFY_PS1 },
          {
            kind: "p",
            text: "Keep the text generic, or run your own ntfy server before putting anything about your work in the body. The [ntfy phone push guide](/guides/ntfy-phone-notifications/) and the [phone page](/phone/) cover private topics, self-hosting and priorities.",
          },
        ],
      },
      {
        id: "anotifier",
        title: "Option 3: anotifier, one command",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: 'Antigravity CLI support arrived in anotifier 1.4.0 and is in the current release, 1.7.1. Setup wires it when a `~/.gemini/antigravity-cli` folder exists. It backs up an existing `~/.gemini/config/hooks.json` to `~/.anotifier/backups/`, then adds one top-level group named `anotifier` with a `Stop` handler (30-second timeout) beside your own groups. If you muted that group with `"enabled": false`, or tuned its timeout, running setup again keeps both. The path in `command` is where anotifier is installed:',
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              anotifier: {
                Stop: [
                  {
                    type: "command",
                    command:
                      'node "/path/to/anotifier/src/notify.mjs" --source antigravity --event Stop',
                    timeout: 30,
                  },
                ],
              },
            }),
          },
          {
            kind: "p",
            text: 'A finished run sends "Task complete", titled `my-app · Antigravity`; the project name is the name of the first folder in `workspacePaths`. The hook always answers `{"decision":"stop"}`, even when a channel fails or you have snoozed notifications, so it can never keep a run going. The alert goes to every channel you enabled: a desktop toast on Windows, macOS, Linux or WSL, an ntfy push to your phone, a Slack, Discord, Telegram or other webhook, and a terminal bell. Setup does not touch the `notifications` setting from Option 1.',
          },
          {
            kind: "table",
            head: ["", "Built-in setting", "Stop hook you write", "anotifier"],
            rows: [
              ["Finished run", "Yes", "Yes", "Yes"],
              [
                "Permission prompt or question",
                "Yes (questions since CLI 1.3.1)",
                "No such event",
                "No such event, so turn the setting on as well",
              ],
              [
                "Desktop toast",
                "System notification",
                "One script per OS",
                "Yes, Windows · macOS · Linux · WSL",
              ],
              [
                "Phone push",
                "No",
                "A curl to ntfy",
                "Yes, ntfy, generic text by default",
              ],
              [
                "Slack / Discord / Telegram",
                "No",
                "Write the JSON yourself",
                "Yes, pick a `format`",
              ],
              [
                "Names the project",
                "Not documented",
                "Parse `workspacePaths` yourself",
                "Yes, `my-app · Antigravity` in the title",
              ],
              ["Snooze / quiet hours", "Turn the setting off", "No", "Yes"],
              [
                "Every agent, one config",
                "No",
                "Repeat per agent",
                "Yes, Claude Code, Codex, Cursor, Gemini CLI and Antigravity",
              ],
              [
                "Setup",
                "One setting",
                "A script and one JSON file",
                "One command, backed up, `uninstall` removes it",
              ],
            ],
          },
          {
            kind: "p",
            text: "`npx anotifier@latest uninstall` removes only the handlers anotifier added to `hooks.json`; your own groups stay. `anotifier snooze 2h` silences every channel for two hours. For what setup writes for each agent, see the [Antigravity CLI page](/antigravity-cli/). What anotifier does not do for Antigravity:",
          },
          {
            kind: "ul",
            items: [
              "**No needs-input alert.** Antigravity has no hook event for permission prompts. Finished runs only.",
              '**An error or a cancel also says "Task complete".** anotifier does not read `terminationReason` or `fullyIdle`, so every `Stop` alerts, even one with background work still running.',
              "**Generic text.** anotifier does not read the transcript for Antigravity, so the alert never quotes what the agent said.",
              "**Not tested against a live Antigravity CLI yet.** The hook wiring and payload parsing are unit-tested against Google's hooks docs, and there is no live Antigravity lane in CI. Run `npx anotifier@latest test` to confirm your channels work, then check that a real run alerts you.",
              "**The 2.0 app and the IDE.** Google's docs say both read the same global `~/.gemini/config/hooks.json`, so a handler setup wrote should fire there too. But setup only wires Antigravity when `~/.gemini/antigravity-cli` exists, and neither app has been tested.",
            ],
          },
        ],
      },
      {
        id: "fix",
        title: "Antigravity CLI notifications not working: fixes by symptom",
        blocks: [
          {
            kind: "table",
            head: ["Symptom", "Cause and fix"],
            rows: [
              [
                "No alert at all from the setting",
                "`notifications` defaults to `false`. Set it to `true` or switch it on in `/config`.",
              ],
              [
                "No alert when it asks a question",
                "That alert arrived in CLI 1.3.1. Update the CLI, then check the setting is on.",
              ],
              [
                "The hook never fires",
                'Run `/hooks` to see what the CLI loaded. Check the file is valid JSON and in one of the places above, that your hook name isn\'t `"enabled": false`, and that the events sit under the hook name, not at the top of the file.',
              ],
              [
                "It fires in the CLI but not in the IDE or app",
                "Google says all three read `~/.gemini/config/hooks.json`, and you manage hooks under Settings > Customizations > Hooks in the app, or the \"...\" menu's Customizations > Hooks in the IDE's agent side panel. A forum report from August 2026 describes `Stop` hooks in `.agents/hooks.json` never running in the Windows IDE, with no confirmed fix (a Google staff reply on 2026-08-14 suggested updating to 2.5.5), so test the global file.",
              ],
              [
                "The toast works in a terminal but not from the hook",
                "Run the script by hand with `sh` or `powershell.exe` and read its output. Keep the `command` to one program call, use absolute paths, and on Windows use forward slashes and `-ExecutionPolicy Bypass`.",
              ],
              [
                "No toast on macOS",
                "Allow Script Editor to send notifications in System Settings, since `osascript` notifications are attributed to it.",
              ],
              [
                "`notify-send` does nothing",
                "No notification daemon, or you are on SSH or in a container with no desktop session. Use [phone push](#phone).",
              ],
              [
                "Nothing shows on Windows",
                "Do not disturb (Focus Assist) is on, or the script path in `hooks.json` has backslashes the JSON swallowed. Use forward slashes.",
              ],
              [
                "Two alerts for one run",
                "The `notifications` setting and a hook are both on, or a hand-written hook sits beside anotifier's. anotifier can't de-duplicate another script.",
              ],
              [
                "The run keeps going after the alert",
                'Your `Stop` handler printed `"decision": "continue"`. Print `{"decision":"stop"}`.',
              ],
              [
                "The alert says complete after a failure",
                "anotifier alerts on every `Stop`. A script of your own can read `terminationReason` and `error` to say more.",
              ],
              [
                "Text from the hook shows up or the answer is ignored",
                "Only the JSON answer belongs on stdout. Send everything else to `/dev/null`, as `curl -s -o /dev/null` does.",
              ],
            ],
          },
        ],
      },
      {
        id: "gemini",
        title: "Gemini CLI vs Antigravity CLI: which setup applies",
        blocks: [
          {
            kind: "p",
            text: "Google replaced Gemini CLI with Antigravity CLI on June 18, 2026: Gemini CLI stopped serving Google AI Pro and Ultra subscribers and free Gemini Code Assist users. It stays available with a paid Gemini API key or a Code Assist Standard or Enterprise license. Google's announcement says hooks are among the features carried into Antigravity CLI, but the setup differs.",
          },
          {
            kind: "table",
            head: ["", "Gemini CLI", "Antigravity CLI"],
            rows: [
              ["Command", "`gemini`", "`agy`"],
              [
                "Built-in alert",
                "`general.enableNotifications` in `~/.gemini/settings.json`",
                "`notifications` in `~/.gemini/antigravity-cli/settings.json`",
              ],
              [
                "Hooks file",
                "The `hooks` key of `~/.gemini/settings.json`",
                "`~/.gemini/config/hooks.json`, `.agents/hooks.json`, or a plugin",
              ],
              [
                "Finished-run event",
                "`AfterAgent`",
                "`Stop`, which must print a `decision`",
              ],
              [
                "Needs-approval event",
                "`Notification`",
                "None; use the built-in setting",
              ],
              ["Hook timeout unit", "Milliseconds", "Seconds (30 by default)"],
            ],
          },
          {
            kind: "p",
            text: "Antigravity's hooks docs list only the files above, not `~/.gemini/settings.json`, so an `AfterAgent` hook there won't fire in Antigravity CLI. For the Gemini CLI side, see the [Gemini CLI notifications guide](/guides/gemini-cli-notifications/). anotifier handles both at once: its Gemini CLI entries stay in `~/.gemini/settings.json` until you remove them with `npx anotifier@latest uninstall`.",
          },
        ],
      },
      {
        id: "sources",
        title: "Sources",
        blocks: [
          {
            kind: "p",
            text: "Each Antigravity CLI claim above comes from Google's official docs or release notes, read on 2026-10-16 when the latest CLI release was 1.4.0. Settings and hooks change between releases, so confirm anything you rely on there.",
          },
          {
            kind: "ul",
            items: [
              "Hooks: file locations, events, handler fields, the `Stop` payload and answer, and the `/hooks` command: [antigravity.google/docs/hooks](https://antigravity.google/docs/hooks?tab=cli)",
              "The `notifications` setting and the location of `settings.json`: Google's [settings](https://antigravity.google/docs/settings/) and [CLI commands reference](https://antigravity.google/docs/cli/reference/) pages (type and default are in the reference)",
              "Question alerts under the `notifications` setting (CLI 1.3.1) and terminal status reporting (CLI 1.4.0): the [antigravity-cli release notes](https://github.com/google-antigravity/antigravity-cli/releases)",
              "The `agy` command: Google's [Antigravity CLI codelab](https://codelabs.developers.google.com/antigravity-cli-hands-on)",
              "Gemini CLI and Antigravity CLI: Google's [transition announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli)",
              "Hooks not firing in the IDE on Windows: a [Google AI Developers Forum report](https://discuss.ai.google.dev/t/stop-and-posttooluse-hooks-in-agents-hooks-json-never-fire-antigravity-ide-1-107-0-windows/178288) from August 2026, unresolved",
              `anotifier 1.7.1: [patch-config.mjs](${AGY_SRC}/setup/patch-config.mjs), [parse-input.mjs](${AGY_SRC}/src/parse-input.mjs), [notify.mjs](${AGY_SRC}/src/notify.mjs), the [README](${AGY_SRC}/README.md) and the [docs](/docs/)`,
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I get Antigravity notifications?",
        a: "In the Antigravity CLI, set notifications to true in ~/.gemini/antigravity-cli/settings.json or switch it on in /config; it sends a desktop notification and a terminal bell when the agent needs your approval or an answer, or finishes. For the Antigravity app and IDE, Google's settings docs list no notifications setting, but its hooks docs say they read the same global ~/.gemini/config/hooks.json as the CLI, so a Stop hook that runs a script and prints a stop decision is the documented route. One forum report from August 2026 says Stop hooks in a project's .agents/hooks.json never ran in the Windows IDE, so use the global file. npx anotifier@latest setup wires the hook when ~/.gemini/antigravity-cli exists, and neither app has been tested.",
      },
      {
        q: "How do I get a notification when Antigravity CLI finishes?",
        a: "Set notifications to true in ~/.gemini/antigravity-cli/settings.json, or switch Notifications on in /config. Antigravity CLI then sends a desktop notification and a terminal bell chime when a task completes or needs you. For your own toast, sound or phone push, add a Stop hook to ~/.gemini/config/hooks.json that runs a script and prints a stop decision, or run npx anotifier@latest setup.",
      },
      {
        q: "Does Antigravity CLI have built-in notifications?",
        a: "Yes. The notifications setting is a boolean that defaults to false. When it is on, the CLI emits a system desktop notification and a terminal bell chime when a long-running task completes or requires your attention, and since CLI 1.3.1 also when the agent stops to ask a question. Google documents no setting for the text, the sound or a phone push.",
      },
      {
        q: "Which Antigravity CLI hook fires when a run is done, and what must it print?",
        a: 'Stop, when the execution loop terminates. It is configured under a hook name in ~/.gemini/config/hooks.json (or .agents/hooks.json in a project) and must print a JSON decision on stdout. continue re-enters the agent loop, any other value lets it stop, so a notification hook prints {"decision":"stop"}. Google documents no exit codes and no behavior for a failed hook.',
      },
      {
        q: "Can I be notified when Antigravity CLI needs permission?",
        a: "Yes, with the built-in notifications setting, which alerts for tool permission prompts and for questions. No hook can: Antigravity has no permission or notification event, only SessionStart, PreToolUse, PostToolUse, PreInvocation, PostInvocation and Stop. anotifier uses the Stop hook, so it reports finished runs only.",
      },
      {
        q: "How do I get Antigravity CLI alerts on my phone?",
        a: "Install the ntfy app, subscribe to a long random topic, and add curl -s -o /dev/null -d 'Antigravity run finished' https://ntfy.sh/your-topic to the script your Stop hook runs, before it prints the stop decision. On Windows use curl.exe instead of curl. anotifier does the same without writing the hook.",
      },
      {
        q: "Do hooks work in the Antigravity 2.0 app and the IDE?",
        a: "Google's docs say the app and the IDE read the same global ~/.gemini/config/hooks.json as the CLI, and you manage them under Settings > Customizations > Hooks in the app, or the ... menu's Customizations > Hooks in the IDE's agent side panel. One forum report from August 2026 says Stop hooks in a project's .agents/hooks.json never ran in the Windows IDE. npx anotifier setup only wires Antigravity when ~/.gemini/antigravity-cli exists, and neither app has been tested.",
      },
      {
        q: "Does anotifier work with Antigravity CLI?",
        a: 'Yes, since anotifier 1.4.0 and in the current 1.7.1. Run npx anotifier@latest setup and it adds an anotifier group with a Stop handler to ~/.gemini/config/hooks.json when ~/.gemini/antigravity-cli exists. You get a "Task complete" alert on your desktop, phone or webhook; a failed or cancelled run says the same, and there is no needs-input alert. It has not yet been tested against a live Antigravity CLI.',
      },
      {
        q: "Do my Gemini CLI notification hooks work in Antigravity CLI?",
        a: "No. Gemini CLI uses AfterAgent and Notification hooks in ~/.gemini/settings.json with timeouts in milliseconds; Antigravity CLI uses Stop and five other events in ~/.gemini/config/hooks.json with timeouts in seconds. Gemini CLI itself still works with a paid Gemini API key or a Code Assist Standard or Enterprise license, since it stopped serving AI Pro, Ultra and free Code Assist users on June 18, 2026.",
      },
    ],
  },
];
