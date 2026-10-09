import type { Guide } from "./guides";
import { json } from "./claude-guides";

/**
 * WSL deep dive: raising a native Windows toast from inside WSL. wsl-notify-send
 * facts were read from github.com/stuartleeks/wsl-notify-send (README, main.go,
 * releases, issues) on 2026-10-09; BurntToast facts from github.com/Windos/BurntToast.
 * anotifier facts are checked against the package source for the version in
 * lib/site.ts (src/platforms/wsl.mjs, assets/windows/toast-wsl.ps1, cli/setup.mjs,
 * cli/status.mjs, cli/doctor-checks.mjs, README.md "WSL").
 */

// The same WinRT call anotifier's own WSL toast makes (assets/windows/toast-wsl.ps1),
// minus the comments: no module, runs on Windows PowerShell 5.1.
const TOAST_PS1 = `param(
  [string]$Title = 'WSL',
  [string]$Message = 'Done'
)
$ErrorActionPreference = 'Stop'
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $xml.GetElementsByTagName('text')
$null = $texts.Item(0).AppendChild($xml.CreateTextNode($Title))
$null = $texts.Item(1).AppendChild($xml.CreateTextNode($Message))
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)`;

const SETUP_SCRIPTS = `mkdir -p ~/bin
cat > ~/bin/win-toast.ps1 <<'EOF'
${TOAST_PS1}
EOF
cat > ~/bin/win-toast <<'EOF'
#!/usr/bin/env bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w ~/bin/win-toast.ps1)" -Title "\${1:-WSL}" -Message "\${2:-Done}"
EOF
chmod +x ~/bin/win-toast`;

const hook = (command: string, extra: Record<string, unknown> = {}) => ({
  hooks: [{ type: "command", command, ...extra }],
});

export const WSL_GUIDES: Guide[] = [
  {
    slug: "wsl-notify-send",
    updated: "2026-10-09",
    kind: "topic",
    name: "WSL Windows toast",
    title: "wsl-notify-send: Windows Toast from WSL, or Without It",
    description:
      'Run wsl-notify-send.exe --category WSL "Done" for a Windows toast from WSL, or call powershell.exe with no install. Wire it to Claude Code and Codex.',
    h1: "How to show a Windows toast from WSL (wsl-notify-send and alternatives)",
    intro:
      "A Linux command inside WSL cannot draw a Windows notification itself, so it launches a Windows program that can. Two ways work: `wsl-notify-send.exe`, a small prebuilt Windows executable you download and put on your PATH, or `powershell.exe`, which is already there and can call the Windows toast API directly. Either one turns a long build, or a Claude Code or Codex session running in WSL, into a toast the moment it finishes. Or run `npx anotifier@latest setup` inside WSL and skip the wiring.",
    sections: [
      {
        id: "options",
        title: "Four ways to get a Windows toast from WSL",
        blocks: [
          {
            kind: "p",
            text: "All three rely on WSL interop, which lets a Linux shell run Windows `.exe` files. It is on by default. The toast is raised by the Windows side, so no notification daemon or D-Bus is needed in the distribution.",
          },
          {
            kind: "table",
            head: ["Option", "Install", "Best for"],
            rows: [
              [
                "`wsl-notify-send.exe`",
                "Download one `.exe` from GitHub Releases, put it on your PATH",
                "A drop-in `notify-send` for scripts that already call it",
              ],
              [
                "`powershell.exe` and a small script",
                "Nothing: Windows PowerShell 5.1 ships with Windows",
                "No downloads, and you control the title and message",
              ],
              [
                "BurntToast",
                "`Install-Module BurntToast` on the Windows side",
                "Buttons, headers, and other rich toast options",
              ],
              [
                "`npx anotifier@latest setup`",
                "One command inside WSL",
                "Agents: it wires the hooks and sends the toast for you",
              ],
            ],
          },
        ],
      },
      {
        id: "wsl-notify-send",
        title: "wsl-notify-send: what it is and how to use it",
        blocks: [
          {
            kind: "p",
            text: "[wsl-notify-send](https://github.com/stuartleeks/wsl-notify-send) is a Windows executable, written in Go on top of go-toast, that accepts a few `notify-send` options and raises a Windows toast. It is MIT licensed. Its README installs it in three steps: grab the latest release zip, extract `wsl-notify-send.exe`, and make sure it is on your `PATH`. The release has `windows_amd64` and `windows_386` zips.",
          },
          {
            kind: "p",
            text: "Its README then defines a `notify-send` function, so scripts that call `notify-send` keep working. This is that function with the variable quoted, for `~/.bashrc`:",
          },
          {
            kind: "code",
            lang: "bash",
            code: 'notify-send() { wsl-notify-send.exe --category "$WSL_DISTRO_NAME" "${@}"; }\n\nnotify-send "Hello from WSL"',
          },
          {
            kind: "p",
            text: "The options, from its source:",
          },
          {
            kind: "table",
            head: ["Option", "What it does"],
            rows: [
              [
                "`-c`, `--category`",
                "Sets the toast **title**. Defaults to `wsl-notify-send`",
              ],
              [
                "`-i`, `--icon`",
                "An icon file to show. Stock icon names are not supported",
              ],
              [
                "`--appId`",
                "The app ID. Non-standard. Defaults to `wsl-notify-send`",
              ],
              ["`--version`", "Prints version and build info"],
              [
                "`-t`, `-h`, `-u`",
                "Accepted for `notify-send` compatibility, then ignored. `-u critical` does not make a toast stay on screen",
              ],
            ],
          },
          {
            kind: "p",
            text: 'It takes exactly one message argument. With none, or with two, it prints its usage instead of a toast. So `notify-send "Build" "finished"` shows the usage text, not a toast: put it all in one quoted string.',
          },
          {
            kind: "note",
            text: "Check its state before you depend on it. As of 2026-10-09 the latest release is `v0.1.871612270`, published on 2021-05-24, and the last commit on `main` is from 2021-05-26. The repository is not archived. It has 8 open items, two of them pull requests (the newer is from July 2026), including a request for notifications that persist (#8) and a report that it is missing from Windows notification settings (#7). The tool is small, so it may still work for you; run the `Hello from WSL` line above to find out.",
          },
        ],
      },
      {
        id: "powershell",
        title: "No install: powershell.exe from WSL",
        blocks: [
          {
            kind: "p",
            text: "Windows PowerShell can raise a toast through the Windows toast API without any module. Save the script below on the Linux side, then run it through `powershell.exe`. `wslpath -w` turns the Linux path into the Windows path of the same file, so Windows can read it straight from your distribution. This is the same call anotifier uses for its own WSL toasts:",
          },
          {
            kind: "code",
            lang: "bash",
            code: SETUP_SCRIPTS,
          },
          {
            kind: "p",
            text: 'Now `~/bin/win-toast "Build" "finished"` shows a toast with that title and message. It is a script rather than a shell function on purpose: agent hooks and `cron` run in their own shell, where a function from your `.bashrc` does not exist.',
          },
          {
            kind: "ul",
            items: [
              "The toast appears under **Windows PowerShell's name and icon**. A plain script has no app identity of its own, so it borrows PowerShell's. Windows notification settings for that app apply to it, and Do not disturb (Focus Assist) can hide it.",
              "The first call after a while can take a second or two, because Windows has to start PowerShell.",
              "`-File` with a typed `param()` block is used on purpose. anotifier avoids `-Command` and `-EncodedCommand` for its WSL toast because they tripped an EDR false positive when spawned from WSL.",
              "If `powershell.exe` is not found, interop is off or the Windows `PATH` is not appended. Check `[interop]` in `/etc/wsl.conf` (`enabled = true`), or call `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` by its full path.",
            ],
          },
          {
            kind: "p",
            text: "If you would rather have a module do it, [BurntToast](https://github.com/Windos/BurntToast) is a PowerShell module for toasts on Windows 10 and newer, installed with `Install-Module -Name BurntToast`. anotifier's native Windows toasts run it from PowerShell 7, so this sample does too. Install PowerShell 7 and the module once on the Windows side, then call them from WSL:",
          },
          {
            kind: "code",
            lang: "bash",
            code: 'powershell.exe -NoProfile -Command "winget install --id Microsoft.PowerShell --source winget"\npwsh.exe -NoProfile -Command "Install-Module -Name BurntToast -Scope CurrentUser"\npwsh.exe -NoProfile -Command "New-BurntToastNotification -Text \'Build\', \'finished\'"',
          },
          {
            kind: "p",
            text: "BurntToast also has buttons, headers and an `-Urgent` switch, which is why you would pick it over the plain script. `pwsh.exe` must be on the PATH that WSL passes through; otherwise call it by its full path, usually `/mnt/c/Program Files/PowerShell/7/pwsh.exe`.",
          },
        ],
      },
      {
        id: "agents",
        title: "Wire it to Claude Code or Codex running in WSL",
        blocks: [
          {
            kind: "p",
            text: "Agents that run in WSL read their settings from the Linux home directory: `~/.claude/settings.json` and `~/.codex/`, not the Windows ones. Point their hooks at `win-toast`. For Claude Code, `Stop` fires when it finishes a turn and `Notification` fires when it needs your permission or input:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [hook('"$HOME/bin/win-toast" "Claude Code" "Finished"')],
                Notification: [
                  hook('"$HOME/bin/win-toast" "Claude Code" "Needs you"'),
                ],
              },
            }),
          },
          {
            kind: "p",
            text: "For Codex CLI, `Stop` runs when a turn ends and `PermissionRequest` runs when it is about to ask for approval. Put this in `~/.codex/hooks.json`. `async: true` stops Codex waiting for the toast, and Codex asks you to trust new hooks the first time: open `/hooks` and review them.",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [
                  hook('"$HOME/bin/win-toast" "Codex" "Turn complete"', {
                    async: true,
                  }),
                ],
                PermissionRequest: [
                  hook('"$HOME/bin/win-toast" "Codex" "Needs approval"', {
                    async: true,
                  }),
                ],
              },
            }),
          },
          {
            kind: "note",
            text: 'Codex\'s older `notify` setting in `config.toml` also works for finished turns, but it fires only for `agent-turn-complete`, never for approvals. Use the hooks above if you want approval toasts. The same hook commands work with `wsl-notify-send.exe`: replace the command with `wsl-notify-send.exe --category Claude "Finished"`.',
          },
        ],
      },
      {
        id: "anotifier",
        title: "The anotifier way: one command inside WSL",
        blocks: [
          { kind: "code", lang: "bash", code: "npx anotifier@latest setup" },
          {
            kind: "p",
            text: "Run it in the WSL shell, not in Windows. anotifier detects WSL by itself: the `microsoft` tag in the kernel version, `/proc/version`, or the `WSL_INTEROP` and `WSL_DISTRO_NAME` variables. Docker containers are not mistaken for WSL. It then wires the hooks of the agents it finds in your Linux home directory and sends each event to your Windows desktop and, if you set one up, your phone.",
          },
          {
            kind: "p",
            text: "The WSL toast is the same trick as the script above. anotifier converts the path of its bundled `toast-wsl.ps1` with `wslpath -w`, then runs it with `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File`. It tries these executables in order and remembers the first that works:",
          },
          {
            kind: "ol",
            items: [
              "`/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`",
              "`powershell.exe`",
              "`/mnt/c/Program Files/PowerShell/7/pwsh.exe`",
              "`pwsh.exe`",
            ],
          },
          {
            kind: "p",
            text: "What you can run to check it:",
          },
          {
            kind: "code",
            lang: "bash",
            code: "anotifier setup        # prints: Windows toast via <powershell path> (WSL interop)\nanotifier status       # Platform WSL, toast Windows toast (WSL interop)\nanotifier doctor       # toast-backend: WSL: Windows toast via <powershell path>\nanotifier test toast   # sends a real toast",
          },
          {
            kind: "ul",
            items: [
              "**`setup`** looks for a reachable Windows PowerShell. If it finds none, it turns the toast channel off and tells you to enable interop (`[interop] enabled=true` in `/etc/wsl.conf`). Run `setup` again once it works and toasts come back on. Toasts you turned off yourself stay off.",
              "**`doctor`** checks that `wslpath` exists and that one of the PowerShell executables above is reachable. It fails with a hint if either is missing. It does not fire a toast, and `doctor --deep` has no WSL read-back, so `anotifier test toast` is the real delivery check.",
              "**A toast that fails** is logged to `~/.anotifier/errors.log` as `toast:wsl`, and `status` shows the recent errors. Each attempt has a 7 second limit.",
              "**Limits:** the toast has a title and a message and nothing else: no custom sound, no per-agent icon, no click-to-focus. It shows under Windows PowerShell's name, like the script above. The terminal bell and phone push behave as on native Linux. There is no end-to-end CI test of a WSL toast landing on a Windows desktop, because hosted runners cannot run both. Detection and the interop call are unit-tested.",
              "`status` and `doctor` have named WSL as its own platform since 1.3.0. Older versions describe it as Linux and may warn that `notify-send` is missing, which does not apply here.",
            ],
          },
          {
            kind: "p",
            text: "On native Windows the toast is richer (agent icon, sound, click-to-focus) because it uses PowerShell 7 and BurntToast. See [Windows & WSL notifications](/guides/windows-wsl-notifications/) for the full comparison, or the [troubleshooting guide](/guides/notifications-not-working/) if nothing appears.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I show a Windows toast notification from WSL?",
        a: 'Run a Windows program from your WSL shell. Either download wsl-notify-send.exe and run wsl-notify-send.exe --category WSL "Done", or call powershell.exe -File with a script that uses the Windows toast API. Both rely on WSL interop, which is on by default.',
      },
      {
        q: "Is wsl-notify-send still maintained?",
        a: "As of 2026-10-09, its latest release is v0.1.871612270 from 2021-05-24 and the last commit on main is from 2021-05-26. The repository is not archived and has 8 open issues and an open pull request from July 2026. It is small and may still work, but it is not actively developed.",
      },
      {
        q: "What does wsl-notify-send --category do?",
        a: "It sets the toast title. It defaults to wsl-notify-send, and the README's notify-send function passes the WSL distribution name. The message is the single argument that follows.",
      },
      {
        q: "Does notify-send work in WSL?",
        a: "The Linux notify-send needs a notification daemon and D-Bus, which a plain WSL distribution usually lacks, so it fails or shows nothing on the Windows desktop. Define a notify-send function that calls wsl-notify-send.exe instead, or use the powershell.exe script in this guide.",
      },
      {
        q: "Do I need BurntToast to send a toast from WSL?",
        a: "No. The Windows toast API is available to Windows PowerShell 5.1 directly, as the script in this guide shows. BurntToast is optional and adds buttons, headers and other rich options.",
      },
      {
        q: "Why does my WSL toast say Windows PowerShell?",
        a: "A script has no app identity of its own, so it uses PowerShell's. The toast shows under that name and icon, and Windows notification settings for Windows PowerShell control it. anotifier's WSL toast does the same.",
      },
      {
        q: "Why do I get no toast when Claude Code or Codex runs in WSL?",
        a: "Check that the hook is in the Linux home directory (~/.claude/settings.json or ~/.codex/hooks.json), that the hook calls a script rather than a shell function, that powershell.exe runs from WSL, and that Do not disturb is off. anotifier doctor checks the interop part, and anotifier test toast sends a real toast.",
      },
      {
        q: "What does anotifier do in WSL?",
        a: "It detects WSL, wires the agent hooks in your Linux home directory, and sends each toast through a bundled PowerShell script run via interop. status and doctor report WSL as its own platform, and a failed toast is logged to ~/.anotifier/errors.log. The toast has no custom sound, icon, or click-to-focus.",
      },
    ],
  },
];
