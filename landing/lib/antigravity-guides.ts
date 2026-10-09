import type { Guide } from "./guides";
import { json } from "./claude-guides";

/**
 * Antigravity CLI notifications. Antigravity facts follow Google's hooks docs
 * (antigravity.google/docs/hooks): file locations, the five events, the Stop
 * payload and the {"decision": ...} reply. anotifier facts mirror the package
 * source for 1.4.0 (setup/patch-config.mjs patchAntigravity, src/parse-input.mjs,
 * src/notify.mjs defaultResponseBody, cli/setup.mjs detectTools). anotifier has
 * not been run against a live Antigravity CLI, and the copy says so.
 */

const STOP_REPLY = '{"decision":"stop"}';

const diyHook = (command: string) =>
  json({
    notify: {
      Stop: [{ type: "command", command: `${command}; echo '${STOP_REPLY}'` }],
    },
  });

const MAC_COMMAND = `osascript -e 'display notification "Antigravity run finished" with title "Antigravity CLI"'`;
const NTFY_COMMAND =
  "curl -s -d 'Antigravity run finished' -H 'Title: Antigravity CLI' https://ntfy.sh/your-secret-topic";

export const ANTIGRAVITY_GUIDES: Guide[] = [
  {
    slug: "antigravity-cli-notifications",
    updated: "2026-10-09",
    kind: "agent",
    agentSlug: "antigravity-cli",
    name: "Antigravity CLI",
    icon: "/assets/icons/gemini.png",
    title: "Antigravity CLI Notifications: Stop Hook in hooks.json",
    description:
      "Add a Stop hook to ~/.gemini/config/hooks.json that ends with a stop decision and fires a desktop or ntfy alert, or run npx anotifier setup (1.4.0+).",
    h1: "How to get notified when Antigravity CLI finishes",
    intro:
      'Antigravity CLI runs hooks from `~/.gemini/config/hooks.json`, and its `Stop` event fires when a run ends. Add a `Stop` handler there that shows a banner or sends a push, and end it by printing `{"decision":"stop"}`, because a Stop hook must answer. Or run `npx anotifier@latest setup` (anotifier 1.4.0 and later), which writes that handler for you. Below is the hook you can write yourself, then what anotifier adds.',
    sections: [
      {
        id: "hook",
        title: "Option 1: a Stop hook you write yourself",
        blocks: [
          {
            kind: "p",
            text: 'Google\'s hooks docs put Antigravity hooks in a `hooks.json` file in one of three places: `~/.gemini/config/hooks.json` for every project, `.agents/hooks.json` in a workspace, or inside an installed plugin. The file maps a hook name you choose to its events: `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`. Each event holds a list of handlers. A handler is a `command` to run, with an optional `type` (only `command` exists) and an optional `timeout` in seconds, 30 by default. Setting `"enabled": false` on a hook name turns it off.',
          },
          {
            kind: "p",
            text: '`Stop` runs when a run ends. Antigravity sends the handler a JSON payload on stdin and waits for a JSON answer on stdout. The answer is `{"decision": "continue"}` to push the agent back into its loop, and any other decision value lets it stop. So a notification hook has to print one, or Antigravity has no answer to read. This one shows a macOS banner and then answers `stop`:',
          },
          {
            kind: "code",
            lang: "json",
            code: diyHook(MAC_COMMAND),
          },
          {
            kind: "ul",
            items: [
              "Put it in `~/.gemini/config/hooks.json`, creating the file if it doesn't exist. If the file already has hooks, add `notify` beside them instead of replacing the file.",
              "The `;` before `echo` keeps the answer going out even if the notification command fails, so a broken banner can't leave the hook silent.",
              '**Linux**: swap the banner for `notify-send "Antigravity CLI" "Run finished"`. It needs a desktop notification daemon, which headless servers and most containers lack.',
              '**Windows**: Google\'s docs say only "shell command", so use a one-liner for the shell Antigravity runs it in, and make it print the same `stop` answer.',
              "The payload also carries `workspacePaths`, `terminationReason`, `fullyIdle` and, when something went wrong, `error`. A longer script can read them to name the project or skip alerts while background work is still running.",
            ],
          },
          {
            kind: "note",
            text: "The Gemini CLI hooks (`AfterAgent`, `Notification`) don't exist in Antigravity, and Antigravity has no notification or permission event. A hook can tell you a run ended; it can't tell you the agent is waiting for approval.",
          },
        ],
      },
      {
        id: "phone",
        title: "Option 2: a push to your phone with ntfy",
        blocks: [
          {
            kind: "p",
            text: "[ntfy](https://ntfy.sh) is a free, open-source push service with Android and iOS apps and no account. Install the app, subscribe to a topic name only you know, and make the `Stop` handler POST to it. Same file, different command:",
          },
          {
            kind: "code",
            lang: "json",
            code: diyHook(NTFY_COMMAND),
          },
          {
            kind: "p",
            text: "Public ntfy.sh topics are guessable, so keep the text generic, or run your own ntfy server before putting anything about your work in the body.",
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
            text: "Antigravity CLI support arrived in anotifier 1.4.0. Setup wires it when a `~/.gemini/antigravity-cli` folder exists. It backs up an existing `~/.gemini/config/hooks.json` to `~/.anotifier/backups/`, then adds one top-level group named `anotifier` with a `Stop` handler, beside your own groups:",
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
            text: 'A finished run sends "Task complete", titled `my-app · Antigravity`; the project name is the first folder in the payload\'s `workspacePaths`. The hook always answers `{"decision":"stop"}`, even when a channel fails or you have snoozed notifications, so it can never keep a run going. The alert goes to every channel you enabled: a desktop toast on Windows, macOS, Linux or WSL, an ntfy push to your phone, a Slack, Discord, Telegram or other webhook, and a terminal bell. The Antigravity 2.0 app and the Antigravity IDE read the same global file, so the alert fires when they finish too.',
          },
          {
            kind: "table",
            head: ["", "Stop hook you write", "anotifier"],
            rows: [
              [
                "Desktop toast",
                "One command per OS, fixed text",
                "Yes, Windows · macOS · Linux · WSL",
              ],
              [
                "Phone push",
                "A curl to ntfy",
                "Yes, ntfy, generic text by default",
              ],
              [
                "Slack / Discord / Telegram",
                "Write the JSON yourself",
                "Yes, pick a `format`",
              ],
              [
                "Names the project",
                "Parse `workspacePaths` yourself",
                "Yes, `my-app · Antigravity` in the title",
              ],
              ["Needs-input alert", "No such event", "No such event"],
              ["Snooze / quiet hours", "No", "Yes"],
              [
                "Every agent, one config",
                "Repeat per agent",
                "Yes, Claude Code, Codex, Cursor, Gemini CLI and Antigravity",
              ],
              [
                "Setup",
                "Edit one JSON file",
                "One command, backed up, `uninstall` removes it",
              ],
            ],
          },
        ],
      },
      {
        id: "limits",
        title: "What anotifier does not do for Antigravity",
        blocks: [
          {
            kind: "ul",
            items: [
              "**No needs-input alert.** Antigravity has no notification or permission event, so there is nothing to hook. Finished runs only.",
              '**An error or a cancel also says "Task complete".** anotifier does not read `terminationReason`, whose values are not fully documented, or `fullyIdle`, so every `Stop` alerts.',
              "**Generic text.** anotifier does not read the transcript for Antigravity, so the alert never quotes what the agent said.",
              "**Not tested against a live Antigravity CLI yet.** The hook wiring and payload parsing are unit-tested against Google's hooks docs, and there is no live Antigravity lane in CI. Run `npx anotifier@latest test` to confirm your channels work, then check that a real run alerts you.",
            ],
          },
          {
            kind: "p",
            text: "`npx anotifier@latest uninstall` removes only the handlers anotifier added to `hooks.json`; your own groups stay. If you moved from Gemini CLI, its hooks live in `~/.gemini/settings.json` and are covered in the [Gemini CLI guide](/guides/gemini-cli-notifications/).",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Which Antigravity CLI hook fires when a run is done?",
        a: "Stop. It is configured under a hook name in ~/.gemini/config/hooks.json (or .agents/hooks.json in a workspace) and must print a JSON decision on stdout: continue re-enters the agent loop, any other value lets it stop.",
      },
      {
        q: "Does anotifier work with Antigravity CLI?",
        a: 'Yes, from anotifier 1.4.0. Run npx anotifier setup and it adds an anotifier group with a Stop handler to ~/.gemini/config/hooks.json when ~/.gemini/antigravity-cli exists. You get a "Task complete" alert on your desktop, phone or webhook. It has not yet been tested against a live Antigravity CLI.',
      },
      {
        q: "Will I be told when Antigravity CLI needs permission?",
        a: "No. Antigravity has no notification or permission event, so neither a hook you write nor anotifier can alert on it. Only finished runs are reported.",
      },
      {
        q: "Why does a failed or cancelled run say Task complete?",
        a: "anotifier does not read terminationReason or fullyIdle from the Stop payload, so every stop alerts with the same text. A missed alert costs more than an early one.",
      },
      {
        q: "Does it work in the Antigravity 2.0 app and the IDE?",
        a: "Yes. Both read the same global ~/.gemini/config/hooks.json, so the handler fires when they finish too.",
      },
      {
        q: "Can the notification hook stop Antigravity from finishing?",
        a: 'Only if it answers continue. anotifier always answers {"decision":"stop"}, so it never keeps a run going, and the same goes for a hook you write if it prints stop.',
      },
    ],
  },
];
