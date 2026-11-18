import type { Guide } from "./guides";
import { json } from "./claude-guides";
import { COMMUNITY_URL } from "./site";

/**
 * Topic guides: platforms and features every agent shares. Every claim here is
 * checked against the package source (cli/, src/, setup/, assets/) for the
 * version in lib/site.ts; where the product has a known gap, the guide says so
 * instead of papering over it.
 *
 * The WSL do-it-yourself sections (wsl-notify-send, the no-install script, hooks
 * pointed at it) came from the standalone /guides/wsl-notify-send/ page, which
 * nginx.conf now 301s to #wsl-notify-send. wsl-notify-send facts were read from
 * github.com/stuartleeks/wsl-notify-send (README, main.go, releases, issues) on
 * 2026-10-09; BurntToast facts from github.com/Windos/BurntToast.
 */

// The same WinRT call anotifier's own WSL toast makes (assets/windows/toast-wsl.ps1),
// minus the comments and the -Silent switch: no module, runs on Windows PowerShell 5.1.
const WSL_TOAST_PS1 = `param(
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

const WSL_SETUP_SCRIPTS = `mkdir -p ~/bin
cat > ~/bin/win-toast.ps1 <<'EOF'
${WSL_TOAST_PS1}
EOF
cat > ~/bin/win-toast <<'EOF'
#!/usr/bin/env bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w ~/bin/win-toast.ps1)" -Title "\${1:-WSL}" -Message "\${2:-Done}"
EOF
chmod +x ~/bin/win-toast`;

const wslHook = (command: string, extra: Record<string, unknown> = {}) => ({
  hooks: [{ type: "command", command, ...extra }],
});

export const TOPIC_GUIDES: Guide[] = [
  {
    slug: "windows-wsl-notifications",
    updated: "2026-11-18",
    kind: "topic",
    name: "Windows & WSL",
    title: "Claude Code Windows Notifications: Native, WSL & Fixes",
    description:
      "Windows: setup installs BurntToast; PowerShell 7 sends the toast. WSL: a Windows toast via powershell.exe interop, no wsl-notify-send. Focus Assist fixes.",
    h1: "Claude Code and Codex notifications on Windows and WSL",
    intro:
      "To get a Claude Code or Codex notification on Windows, run `npx anotifier@latest setup` in PowerShell. It wires the hooks and installs the BurntToast module, and the toast itself is sent by PowerShell 7 (`pwsh`). Inside WSL, run the same command inside the distribution: the toast then reaches Windows through `powershell.exe` interop, with no `wsl-notify-send` and no BurntToast. This guide covers what each path needs, what you get from it, and the usual reasons a Windows toast does not appear, including Do not disturb and Focus Assist.",
    sections: [
      {
        id: "which",
        title: "Which road does your toast take?",
        blocks: [
          {
            kind: "table",
            head: [
              "Where the agent runs",
              "What sends the toast",
              "What you get",
              "What it needs",
            ],
            rows: [
              [
                "Windows: PowerShell, CMD, Windows Terminal, the VS Code terminal",
                "`pwsh` running anotifier's `toast.ps1` with BurntToast",
                "The agent's icon, a Windows notification sound, a title like `my-app · Claude Code`, and click-to-focus",
                "PowerShell 7 and the BurntToast module; `setup` installs the module",
              ],
              [
                "A WSL distribution",
                "`powershell.exe` (or `pwsh.exe`) reached through Windows interop, running `toast-wsl.ps1`",
                "A plain toast with the title and message, shown under Windows PowerShell's name: no agent icon or click-to-focus, and the default Windows sound: sound names have no effect, but an audio file set as `toastSound` (1.8.0 and later) plays instead",
                "Interop on, and PowerShell reachable through `/mnt/c` or the PATH",
              ],
            ],
          },
          {
            kind: "p",
            text: "Phone push and webhooks do not depend on any of this, and neither does the Claude Code bell (Claude Code writes it itself), so they still arrive when a toast cannot. The terminal bell for other agents is a separate path: on native Windows it also runs through `pwsh`.",
          },
        ],
      },
      {
        id: "native-windows",
        title: "Native Windows: PowerShell 7 and BurntToast",
        blocks: [
          {
            kind: "p",
            text: "On Windows every toast is sent by `pwsh` (PowerShell 7) running anotifier's `toast.ps1`, which uses the [BurntToast](https://github.com/Windos/BurntToast) module. PowerShell 7 installs side by side with the Windows PowerShell 5.1 that ships with Windows and does not replace it. `powershell.exe` on its own cannot send these toasts. Install PowerShell 7 with `winget`, then run setup:",
          },
          {
            kind: "code",
            lang: "powershell",
            code: "winget install --id Microsoft.PowerShell --source winget\nnpx anotifier@latest setup\nnpx anotifier@latest test toast",
          },
          {
            kind: "p",
            text: "What `setup` does for the toast on Windows:",
          },
          {
            kind: "ul",
            items: [
              "Writes the hooks for each agent it finds: `Stop` and `Notification` for Claude Code in `~/.claude/settings.json`, and `Stop`, `PermissionRequest` and `SessionStart` for Codex in `%USERPROFILE%\\.codex\\hooks.json`, plus (1.8.0 and later) a small `UserPromptSubmit` timing hook for both. Each hook is one `node` command that runs anotifier's `notify.mjs`. Claude Code runs a hook command with Git Bash on Windows, or with PowerShell when Git Bash is not installed.",
              "Checks for `pwsh`. If it is there, it installs BurntToast for your user with `Install-Module BurntToast -Scope CurrentUser` when the module is missing. Nothing is installed while a hook runs.",
              "If `pwsh` is missing, or the BurntToast install fails, it turns the toast channel off and prints the `winget` command. `status` then shows `toast: off, no backend`. Phone push and webhooks stay on. Run `setup` again once PowerShell 7 is installed and the toast comes back on; a toast you switched off yourself stays off.",
            ],
          },
          {
            kind: "ul",
            items: [
              "Each toast carries the agent's own icon and a title like `my-app · Claude Code`.",
              "Sounds are the Windows notification sounds: `Default`, `IM`, `Mail`, `Reminder`, `SMS`, `Alarm`. Finished tasks play `IM`; approvals and questions play `Reminder`. Change them per event with `events.<event>.toastSound`.",
              "A toast has 7 seconds to send. If BurntToast is missing or fails, you hear the Windows exclamation sound instead of seeing a toast, and the failure is logged to `~/.anotifier/errors.log` as `toast:windows` with the cause (`pwsh not found`, `exit code 3`, or `timed out after 7000 ms`).",
            ],
          },
        ],
      },
      {
        id: "click-to-focus",
        title: "Click-to-focus",
        blocks: [
          {
            kind: "p",
            text: "Clicking a native toast brings the terminal or editor that ran the agent to the front, so an approval prompt is one click away. When the hook knows the project name or working directory, the toast carries an `agentfocus://` link, and on the first toast anotifier registers a handler for it under `HKCU\\Software\\Classes\\agentfocus`. Clicking the toast runs `pwsh` to choose a window:",
          },
          {
            kind: "ol",
            items: [
              "It looks at visible windows whose title contains the project folder name.",
              "Among those it prefers one whose title also names a terminal (Windows Terminal, PowerShell, cmd, Warp, WezTerm and similar), then a Visual Studio Code window, then a Cursor window, then any other match.",
              "If no title matches, it falls back to the window that `toast.ps1` found by walking up the process tree from the hook, as long as that window still exists.",
            ],
          },
          {
            kind: "p",
            text: "So a custom terminal tab title that drops the folder name sends the click to the fallback window. To turn click-to-focus off:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "toast": { "clickToFocus": false } }',
          },
          {
            kind: "note",
            text: "`anotifier uninstall` removes the hooks. Since 1.3.0 it also removes the `agentfocus` registry key, but only when the key points at anotifier's own focus script, so a handler another program registered is left alone (1.2.6 and earlier leave the key in place). The BurntToast module stays installed either way, since other tools may use it. For a completely clean machine, remove what is left by hand: `Remove-Item -Recurse HKCU:\\Software\\Classes\\agentfocus` and `Uninstall-Module BurntToast`.",
          },
        ],
      },
      {
        id: "wsl",
        title: "Inside WSL: how the toast crosses into Windows",
        blocks: [
          {
            kind: "p",
            text: "A Linux process in WSL cannot draw a Windows notification, so anotifier asks Windows to do it. It detects WSL from the kernel version string, `/proc/version`, the `WSL_INTEROP` and `WSL_DISTRO_NAME` variables, or other WSL markers (Docker containers are not mistaken for WSL) and uses the Windows path instead of `notify-send`. Microsoft documents the mechanism it relies on: WSL can run Windows tools from the Linux command line as `tool-name.exe`. The steps:",
          },
          {
            kind: "ol",
            items: [
              "`wslpath -w` converts the path of anotifier's `toast-wsl.ps1` into a Windows path such as `\\\\wsl.localhost\\Ubuntu\\…`, so Windows PowerShell can open a file that lives inside the distribution.",
              "It runs a PowerShell with `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File` and the title and message as typed parameters, never `-Command`. It tries these in order until one works: `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`, then `powershell.exe` on the PATH, then `/mnt/c/Program Files/PowerShell/7/pwsh.exe`, then `pwsh.exe` on the PATH.",
              "`toast-wsl.ps1` calls the Windows toast API directly, using PowerShell's own registered app identity. That is why it needs no BurntToast and shows under Windows PowerShell's name.",
            ],
          },
          {
            kind: "p",
            text: "The result is deliberately simple: the title and the message, with no per-agent icon or click-to-focus, and the default Windows sound: sound names have no effect, but an audio file set as `toastSound` (1.8.0 and later) plays instead. Each attempt has 7 seconds. A failure is logged to `~/.anotifier/errors.log` as `toast:wsl`; when none of the four works, the entry lists each one it tried.",
          },
          {
            kind: "ul",
            items: [
              "Run `npx anotifier@latest setup` **inside** the distribution. Agents in WSL read their settings from the Linux home directory, so a Windows-side setup does not wire them. Claude Code's own setup page says the same for the agent: install and launch `claude` inside the WSL terminal, not from PowerShell or CMD.",
              "Interop must be on. It is by default: the `[interop]` section of `/etc/wsl.conf` has `enabled` (default `true`) and `appendWindowsPath` (default `true`). With `enabled = false` there is no route to a toast. With only `appendWindowsPath = false`, the two absolute `/mnt/c` paths above do not depend on the PATH, so they are still tried while C: is mounted at `/mnt/c`.",
              "Changes to `wsl.conf` apply only after WSL has fully stopped. Run `wsl --shutdown` from PowerShell, then open the distribution again.",
              "`setup` looks for a reachable PowerShell. If it finds none, it turns the toast channel off and tells you to enable interop. Run `setup` again once it works.",
            ],
          },
          {
            kind: "p",
            text: "What each command prints inside WSL once the road works. `doctor` does not fire a toast, so `test toast` is the real delivery check:",
          },
          {
            kind: "code",
            lang: "bash",
            code: "anotifier setup        # prints: Windows toast via <powershell path> (WSL interop)\nanotifier status       # Platform WSL, toast Windows toast (WSL interop)\nanotifier doctor       # toast: WSL: Windows toast via <powershell path>\nanotifier test toast   # sends a real toast",
          },
          {
            kind: "note",
            text: "In 1.2.6 and earlier, `setup`, `status`, and `doctor` describe WSL as plain Linux, so they may warn that `notify-send` is missing, and a failed WSL toast is not written to `errors.log`. 1.3.0 fixes both: all three commands name the Windows-interop toast path, `doctor` checks for `wslpath` and a reachable Windows PowerShell instead of `notify-send`, and a failed WSL toast is logged as `toast:wsl`.",
          },
        ],
      },
      {
        id: "wsl-notify-send",
        title: "Do you need wsl-notify-send?",
        blocks: [
          {
            kind: "p",
            text: "No. anotifier never calls `wsl-notify-send`. It runs PowerShell directly, so there is nothing to download and nothing to put on your PATH. [wsl-notify-send](https://github.com/stuartleeks/wsl-notify-send) is a separate prebuilt Windows executable that accepts a few `notify-send` options. It is useful when you write your own hook and want a drop-in `notify-send` inside WSL. The rest of this section is for that case: what it is, how its options behave, and how it compares with the other do-it-yourself roads. To skip the wiring, run `npx anotifier@latest setup` inside WSL.",
          },
          {
            kind: "p",
            text: "All the roads below rely on WSL interop, which lets a Linux shell run Windows `.exe` files. It is on by default. The toast is raised by the Windows side, so no notification daemon or D-Bus is needed in the distribution. All of them give the same kind of toast: a title and a message under a generic app name. The native Windows road is the one with the icon, sound and click-to-focus.",
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
                "Buttons, headers, and other rich toast options. The repository is archived and unmaintained",
              ],
              [
                "`npx anotifier@latest setup`",
                "One command inside WSL",
                "Agents: it wires the hooks and sends the toast for you",
              ],
            ],
          },
          {
            kind: "p",
            text: "[wsl-notify-send](https://github.com/stuartleeks/wsl-notify-send) is written in Go on top of go-toast and is MIT licensed. Its README installs it in three steps: download the latest release, create the `notify-send` helper function, and test it. The release has `windows_amd64` and `windows_386` zips. Because the helper is a `notify-send` function, scripts that call `notify-send` keep working. This is that function with the variable quoted, for `~/.bashrc`:",
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
            text: "Check its state before you depend on it. As of 2026-10-09 the latest release is `v0.1.871612270`, published on 2021-05-24, and the last commit on `main` is from 2021-05-26. The repository is not archived. It has 6 open issues and 2 open pull requests (the newer from July 2026), including a request for notifications that persist (#8) and a report that it is missing from Windows notification settings (#7). The tool is small, so it may still work for you; run the `Hello from WSL` line above to find out.",
          },
        ],
      },
      {
        id: "wsl-powershell-script",
        title: "No install: a toast script with powershell.exe",
        blocks: [
          {
            kind: "p",
            text: "Windows PowerShell can raise a toast through the Windows toast API without any module. Save the script below on the Linux side, then run it through `powershell.exe`. `wslpath -w` turns the Linux path into the Windows path of the same file, so Windows can read it straight from your distribution. This is the same call anotifier uses for its own WSL toast, without its `-Silent` switch:",
          },
          {
            kind: "code",
            lang: "bash",
            code: WSL_SETUP_SCRIPTS,
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
            text: "If you would rather have a module do it, [BurntToast](https://github.com/Windos/BurntToast) is a PowerShell module for toasts on Windows 10 and newer, installed with `Install-Module -Name BurntToast`. The Windos/BurntToast repository is archived and no longer maintained, though its last release still works. anotifier's native Windows toasts run it from PowerShell 7, so this sample does too. Install PowerShell 7 and the module once on the Windows side, then call them from WSL:",
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
        id: "wsl-agent-hooks",
        title: "Point your own Claude Code or Codex hooks at it",
        blocks: [
          {
            kind: "p",
            text: "If you wire the hooks yourself instead of running `setup`, remember that agents in WSL read their settings from the Linux home directory: `~/.claude/settings.json` and `~/.codex/`, not the Windows ones. Point their hooks at `win-toast`. For Claude Code, `Stop` fires when it finishes a turn and `Notification` fires for several notification types, so the matcher limits it to permission and idle prompts:",
          },
          {
            kind: "code",
            lang: "json",
            code: json({
              hooks: {
                Stop: [
                  wslHook('"$HOME/bin/win-toast" "Claude Code" "Finished"'),
                ],
                Notification: [
                  {
                    matcher: "permission_prompt|idle_prompt",
                    ...wslHook(
                      '"$HOME/bin/win-toast" "Claude Code" "Needs you"',
                    ),
                  },
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
                  wslHook('"$HOME/bin/win-toast" "Codex" "Turn complete"', {
                    async: true,
                  }),
                ],
                PermissionRequest: [
                  wslHook('"$HOME/bin/win-toast" "Codex" "Needs approval"', {
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
        id: "wslg",
        title: "WSLg and WSL notifications",
        blocks: [
          {
            kind: "p",
            text: "WSLg is Microsoft's support for running Linux GUI applications on Windows. Microsoft's documentation lists it for WSL 2 on Windows 10 build 19044 or later and on Windows 11, and describes GUI apps, not desktop notifications. anotifier does not depend on it. The toast is raised by Windows through interop, so you do not need WSLg, a notification daemon or D-Bus inside the distribution for it to work.",
          },
        ],
      },
      {
        id: "focus-assist",
        title: "Do not disturb and Focus Assist",
        blocks: [
          {
            kind: "p",
            text: "A common reason for `Toast sent` with nothing on screen is Windows itself holding the banner back. Windows 11 calls the feature Do not disturb (Focus assist on older builds). While it is on, Windows shows banners only for alarms, reminders and the apps you allow, and sends everything else to the notification center, so a missed toast is usually waiting there. anotifier does not detect it, and `test toast` reports `Toast sent` whenever the PowerShell call succeeds.",
          },
          {
            kind: "ul",
            items: [
              "Turn it off from the notification center (the bell icon), or allow the sender under **Settings > System > Notifications**, in the Do not disturb **Apps** list (**Add apps**).",
              "It can switch on by itself. Under **Turn on do not disturb automatically**, Windows lists rules for certain times of day, when duplicating the display, when playing a game, when using an app in full-screen mode, and for the first hour after a Windows feature update.",
              "Per-app settings matter too. On **Settings > System > Notifications**, under **Notifications from apps and other senders**, open the sender and check that notifications and **Show notification banners** are on, and **Play a sound** if you want the ding. For a WSL toast the sender is Windows PowerShell.",
            ],
          },
        ],
      },
      {
        id: "not-working",
        title: "Windows toast not showing? Fixes by symptom",
        blocks: [
          {
            kind: "p",
            text: "Start with `anotifier status`, which prints the last 8 hook errors from `~/.anotifier/errors.log`, then match what you see:",
          },
          {
            kind: "table",
            head: ["Symptom", "Likely cause", "Fix"],
            rows: [
              [
                "`toast:windows`, `pwsh not found`",
                "PowerShell 7 is not installed or not on the PATH",
                "`winget install --id Microsoft.PowerShell --source winget`, then `npx anotifier@latest setup`",
              ],
              [
                "`toast:windows`, `exit code 3`, and a Windows exclamation sound instead of a banner",
                "BurntToast is missing or failed to load or send; the cause is in the log's stderr",
                "`Install-Module BurntToast -Scope CurrentUser`, or run `setup` again",
              ],
              [
                "`toast:windows`, `timed out after 7000 ms`",
                "`pwsh` did not finish in the 7 second window",
                "Run `anotifier test toast` again and check whether it succeeds",
              ],
              [
                "`doctor` fails with an execution policy message",
                "A `MachinePolicy` or `UserPolicy` of `Restricted` or `AllSigned` is set by Group Policy",
                "anotifier passes `-ExecutionPolicy Bypass`, which covers every other scope. Microsoft documents that Group Policy overrides the policies set in PowerShell, so ask your administrator",
              ],
              [
                "`status` shows `toast: off, no backend`",
                "`setup` turned the toast channel off because PowerShell 7, BurntToast, or the WSL route was missing. `test toast` ignores that switch, so it can pass while real alerts are off",
                "Install the missing piece and run `setup` again",
              ],
              [
                "`Toast sent`, no banner",
                "Do not disturb, or the sender's notification settings",
                "See the Do not disturb section above",
              ],
              [
                "The test works, the real alert does not",
                "The hook is not wired, the agent was started before setup, or notifications are snoozed",
                "Restart the agent, run `status`, and use the [troubleshooting guide](/guides/notifications-not-working/)",
              ],
              [
                "WSL: `toast:wsl`, `no Windows PowerShell reachable through WSL interop`",
                "Interop is off, or C: is not mounted at `/mnt/c` and PowerShell is not on the PATH",
                "Set `[interop] enabled=true` in `/etc/wsl.conf`, run `wsl --shutdown` from Windows, reopen the distribution",
              ],
              [
                "WSL: `wslpath could not translate the toast script path`",
                "`wslpath` is missing, so the script path cannot be handed to Windows",
                "Run anotifier inside a WSL distribution, where `wslpath` ships",
              ],
              [
                "Nothing at all from an agent that runs in WSL",
                "Setup was run on Windows, not in the distribution",
                "Run `npx anotifier@latest setup` inside WSL, and `status` on both sides to see which one has the hooks",
              ],
            ],
          },
        ],
      },
      {
        id: "wsl-exit-code",
        title: '"Terminal process wsl.exe terminated with exit code: -1"',
        blocks: [
          {
            kind: "p",
            text: 'This message is not an anotifier error. VS Code prints "The terminal process … terminated with exit code" when the shell it launched exits, and here the shell is `wsl.exe`. anotifier never starts `wsl.exe`: on Windows it runs `pwsh`, and from inside WSL it runs `powershell.exe`, and its own failures go to `errors.log` as `toast:windows` or `toast:wsl`.',
          },
          {
            kind: "p",
            text: 'VS Code\'s terminal troubleshooting page covers the WSL case. Run `wsl --status` and `wsl --list --verbose` in PowerShell outside the editor to see whether WSL starts at all. Use a real Linux distribution rather than a Docker-managed one such as `docker-desktop-data`, set the default with `wsl --set-default "<distribution-name>"`, and update a terminal profile that names a distribution with `-d`. That page documents exit code 1 for WSL and does not explain -1, so this guide cannot tell you what -1 means. If WSL itself starts but the toast does not appear, the table above applies.',
          },
        ],
      },
      {
        id: "powershell-exit-code",
        title:
          '"Terminal process powershell.exe terminated with exit code" in VS Code',
        blocks: [
          {
            kind: "p",
            text: "The same kind of message appears for PowerShell. VS Code prints it when the shell in your terminal profile, Windows PowerShell or PowerShell 7, fails to start or exits. It is a VS Code message, not an anotifier error. The text people search for looks like this:",
          },
          {
            kind: "code",
            lang: "text",
            code: 'The terminal process "c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe" terminated with exit code: 1.\nThe terminal process "c:\\program files\\powershell\\7\\pwsh.exe" terminated with exit code: 1.\nThe terminal process failed to launch: Path to shell executable "c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe" does not exist.',
          },
          {
            kind: "p",
            text: "The exit code comes from the shell or from Windows, not from VS Code, and VS Code's terminal troubleshooting page says an exit code alone is not a diagnosis. It mentions only a few: code 1 from WSL (which it says is not unique to a missing default distribution), code 259 (which on its own does not say which component failed), and 3221225786, which is 0xC000013A, `STATUS_CONTROL_C_EXIT`, Windows' code for termination by Ctrl+C. It does not explain 1 or 2 for PowerShell, -65536, or any other value, so this guide cannot tell you what they mean. Some reported codes are NTSTATUS values written as signed 32-bit numbers. Microsoft's NTSTATUS list defines the hex values: -1073741819 is 0xC0000005 (`STATUS_ACCESS_VIOLATION`), -1073741790 is 0xC0000022 (`STATUS_ACCESS_DENIED`) and -1073740791 is 0xC0000409 (`STATUS_STACK_BUFFER_OVERRUN`). Neither Microsoft's list nor VS Code's page says what in your setup caused one.",
          },
          {
            kind: "p",
            text: "What the VS Code page does recommend, one change at a time:",
          },
          {
            kind: "ul",
            items: [
              "For \"path to shell executable ... does not exist\", the terminal profile, or a task's or extension's shell setting, points at a shell that is not there. Pick an installed shell from the dropdown next to New Terminal, or run Terminal: Select Default Profile. In settings, check `terminal.integrated.defaultProfile.windows` and `terminal.integrated.profiles.windows`: the executable path must exist and its arguments must be valid for that shell.",
              'For "terminated with exit code", the shell may have started and then exited: check the last terminal output and the command that ran before it closed.',
              "Run the same shell with the same arguments outside the editor. If it fails there too, look at the shell or Windows first. If it works, try `powershell.exe -NoProfile` (Windows PowerShell) or `pwsh -NoProfile` (PowerShell 7); if that works, a profile script is the suspect. Then set `terminal.integrated.shellIntegration.enabled` to false, open a new terminal, and restore the value afterwards.",
              'Make sure compatibility mode is off: in Properties for the VS Code executable, open the Compatibility tab and clear "Run this program in compatibility mode".',
              'If the message says "A native exception occurred during launch", read the detail after it. For access denied (error code 5), check permissions on the shell executable and the starting directory, and any security software block notifications. The page says not to disable protection or add broad exclusions as a workaround.',
              "Update VS Code, your shell and Windows. To capture logs, start from a fresh reproduction before changing more settings: run Developer: Set Log Level... and choose Trace, reproduce it, read the Terminal and Pty Host logs under Developer: Open Log..., then restore the previous level. Remove secrets before sharing them.",
            ],
          },
          {
            kind: "p",
            text: "Why a notification guide covers this: anotifier does not use your VS Code terminal profile, but it does run PowerShell itself. On Windows it sends the toast with `pwsh` (PowerShell 7), not `powershell.exe`, so a missing `pwsh.exe` stops toasts there. From inside WSL it tries Windows PowerShell's `powershell.exe` under `/mnt/c`, then `powershell.exe` from PATH, then PowerShell 7's `pwsh.exe` under `/mnt/c/Program Files/PowerShell/7/`, then `pwsh.exe` from PATH, moving to the next one when a try fails, and the toast fails when none of them works or when `wslpath` cannot translate the script path. `anotifier doctor` checks this: on Windows it fails when `pwsh` is missing, and in WSL it fails when `wslpath` or every Windows PowerShell is missing. `anotifier test toast` then sends a real toast through the same path, so you can see whether it arrives.",
          },
        ],
      },
      {
        id: "test",
        title: "Send a test toast",
        blocks: [
          {
            kind: "code",
            lang: "powershell",
            code: "npx anotifier@latest test toast   # real toast: prints Toast sent or Toast failed\nnpx anotifier@latest doctor       # PowerShell 7, BurntToast, execution policy (WSL: wslpath, PowerShell)\nnpx anotifier@latest status       # wired agents, the toast backend and the last 8 errors",
          },
          {
            kind: "ul",
            items: [
              "`test toast` uses the same backend as the hooks and exits with code 1 when it fails. It skips the agent's hook, snooze and quiet hours, and it ignores `toast.enabled`, so it can pass while real alerts are off. `status` shows whether the toast channel is on.",
              "On Windows, `doctor` fails when PowerShell 7 is missing, warns when BurntToast is not installed, and fails on a blocking Group Policy execution policy. In WSL it checks for `wslpath` and a reachable Windows PowerShell. `doctor --deep` has no read-back on Windows or WSL, so `test toast` is the real delivery check.",
              "To test BurntToast without anotifier, run `pwsh -NoProfile -Command \"New-BurntToastNotification -Text 'Test','Hello'\"`. To test the WSL road by hand, use [the no-install toast script](#wsl-powershell-script) above.",
              "If the test works and real alerts do not, the problem is between the agent and anotifier. Restart the agent so it reloads its hooks, and see the [troubleshooting guide](/guides/notifications-not-working/).",
            ],
          },
          {
            kind: "p",
            text: "Related Windows guides: [Claude Code notification sounds on Windows and WSL](/guides/claude-code-notification-sound/#windows), [Codex CLI notifications on Windows](/guides/codex-cli-notifications/#windows), and [Cursor notifications on Windows and WSL](/guides/cursor-agent-notifications/#windows).",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Why don't I get a Claude Code notification on Windows?",
        a: "Claude Code runs hooks on its Stop and Notification events, and something has to turn them into a toast. Run npx anotifier@latest setup in PowerShell: it wires the hooks and installs BurntToast, and the toast is sent by PowerShell 7. If nothing appears, run anotifier test toast, then check anotifier status for a toast:windows error, and check that Do not disturb is off.",
      },
      {
        q: "Does it work in WSL2?",
        a: "Yes. Run npx anotifier@latest setup inside the WSL distribution where the agent runs. anotifier detects WSL and sends the toast through powershell.exe and Windows interop, which is on by default. The toast is plain: a title and a message under Windows PowerShell's name, with no agent icon or click-to-focus; it plays the default Windows sound, or your own audio file if toastSound is one (1.8.0 and later).",
      },
      {
        q: "Do I need wsl-notify-send or BurntToast inside WSL?",
        a: "No. anotifier does not use wsl-notify-send, and the WSL toast calls the Windows toast API directly through Windows PowerShell, so it needs no BurntToast either. BurntToast is only used for native Windows toasts, and setup installs it there. wsl-notify-send is an option if you write your own hooks. For a toast script of your own, the Windows toast API is available to Windows PowerShell 5.1 directly, as the script in this guide shows; BurntToast only adds buttons, headers and other rich options, and its repository is archived and no longer maintained, though the last release still works.",
      },
      {
        q: "How do I show a Windows toast notification from WSL?",
        a: 'Run a Windows program from your WSL shell. Either download wsl-notify-send.exe and run wsl-notify-send.exe --category WSL "Done", or call powershell.exe -File with a script that uses the Windows toast API. Both rely on WSL interop, which is on by default. For Claude Code or Codex, npx anotifier@latest setup run inside WSL does the wiring for you.',
      },
      {
        q: "Is wsl-notify-send still maintained?",
        a: "As of 2026-10-09, its latest release is v0.1.871612270 from 2021-05-24 and the last commit on main is from 2021-05-26. The repository is not archived and has 6 open issues and 2 open pull requests, the newer from July 2026. It is small and may still work, but it is not actively developed.",
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
        q: "Why does my WSL toast say Windows PowerShell?",
        a: "A script has no app identity of its own, so it uses PowerShell's. The toast shows under that name and icon, and Windows notification settings for Windows PowerShell control it. anotifier's WSL toast does the same.",
      },
      {
        q: "Why do I get no toast when Claude Code or Codex runs in WSL?",
        a: "Check that the hook is in the Linux home directory (~/.claude/settings.json or ~/.codex/hooks.json), that a hook you wrote calls a script rather than a shell function, that powershell.exe runs from WSL, and that Do not disturb is off. anotifier doctor checks the interop part, and anotifier test toast sends a real toast.",
      },
      {
        q: "Why is a Windows toast silent or missing even though the test says Toast sent?",
        a: "Usually Do not disturb, called Focus Assist on older Windows. While it is on, Windows shows banners only for alarms, reminders and the apps you allow, and sends the rest to the notification center. It can also switch on by itself, for example when an app is full screen. anotifier does not detect it. Turn it off, or allow the sender in Settings > System > Notifications.",
      },
      {
        q: 'What does "terminal process wsl.exe terminated with exit code -1" mean?',
        a: "It is a VS Code terminal message, not an anotifier error: the wsl.exe shell VS Code launched exited. anotifier never starts wsl.exe. VS Code's terminal troubleshooting page says to check wsl --status and wsl --list --verbose outside the editor, use a real Linux distribution, and fix the default distribution or the profile's -d setting. It documents exit code 1 for WSL and does not explain -1.",
      },
      {
        q: 'What does "the terminal process powershell.exe terminated with exit code" or "path to shell executable does not exist" mean?',
        a: "It is a VS Code terminal message, not an anotifier error: the PowerShell your terminal profile launches failed to start or exited. The exit code comes from the shell or Windows, and VS Code's troubleshooting page says a code alone is not a diagnosis; it does not explain 1, 2 or -65536 for PowerShell. For a missing path, it says to check the terminal profile and pick an installed shell. For an exit code, it says to check the last output and the command that ran before the exit, run the same shell outside the editor with -NoProfile, try with shell integration off, clear compatibility mode on Windows, update VS Code, the shell and Windows, and capture the Terminal and Pty Host trace logs.",
      },
      {
        q: "If powershell.exe or pwsh.exe is broken, do anotifier notifications stop?",
        a: "Sometimes. Windows toasts are sent by pwsh (PowerShell 7), so a missing pwsh stops them, and powershell.exe is not used there. In WSL, anotifier tries powershell.exe and then pwsh.exe through Windows interop, moving on when one fails, and the toast fails when none of them works. A broken VS Code terminal profile on its own does not stop toasts, because anotifier does not use it. Run anotifier doctor, then anotifier test toast.",
      },
      {
        q: "Are Windows notifications tested?",
        a: "Native Windows toasts are verified in CI on a real Windows runner by reading them back out of Windows' own notification database. The WSL path has unit tests but no end-to-end CI run, because hosted runners cannot start WSL.",
      },
    ],
  },
  {
    slug: "macos-linux-notifications",
    updated: "2026-11-18",
    kind: "topic",
    name: "macOS & Linux",
    title: "Claude Code & Codex Notifications on macOS and Linux",
    description:
      "How coding-agent alerts work on macOS (osascript, Notification Center permissions) and Linux (notify-send), and how to test that banners actually arrive.",
    h1: "Agent notifications on macOS and Linux",
    intro:
      "On macOS and Linux anotifier uses the notification tool the operating system already has: `osascript` on a Mac and `notify-send` on Linux. Nothing runs in the background, and on macOS nothing extra is installed. Here is what each backend shows, what it needs, and how to check that banners really arrive.",
    sections: [
      {
        id: "macos",
        title: "macOS: osascript and Notification Center",
        blocks: [
          {
            kind: "p",
            text: "Each toast is an AppleScript `display notification` call with the title (`my-app · Claude Code`), the message, and a sound. There is no helper app to install, which also means no custom icon and no click action: macOS shows the banner under the app it attributes AppleScript notifications to, usually Script Editor or your terminal.",
          },
          {
            kind: "p",
            text: "Sounds map to built-in macOS sounds: finished tasks (`IM`) play Glass and approvals or questions (`Reminder`) play Ping. `Mail` maps to Purr, `SMS` to Tink, and `Alarm` to Sosumi. You can also name any built-in sound directly:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{ "events": { "task_complete": { "toastSound": "Hero" } } }',
          },
          {
            kind: "ul",
            items: [
              "No banners? Open **System Settings > Notifications**, find Script Editor (or your terminal app) and allow notifications. The entry only appears after a first notification has been sent, so run `anotifier test toast` once first.",
              "`anotifier doctor` reads that permission and warns when the app is not allowed. macOS does not expose this officially, so doctor treats the reading as best-effort.",
              "`anotifier doctor --deep` sends a marker notification and reads it back from Notification Center's database, waiting up to 15 seconds. If the database can't be read, grant your terminal Full Disk Access in **System Settings > Privacy & Security**.",
              "A Focus mode can hide the banner while macOS still records it as delivered, and doctor cannot tell whether a Focus is on.",
            ],
          },
        ],
      },
      {
        id: "linux",
        title: "Linux: notify-send",
        blocks: [
          {
            kind: "p",
            text: "On Linux each toast is a `notify-send` call with the agent's icon, the title, and the message. It needs a desktop session with a notification daemon (GNOME, KDE Plasma, and most desktops ship one) and the libnotify command-line tool:",
          },
          {
            kind: "code",
            lang: "bash",
            code: "sudo apt install libnotify-bin   # Debian, Ubuntu\nsudo dnf install libnotify       # Fedora\nsudo pacman -S libnotify         # Arch",
          },
          {
            kind: "p",
            text: "Priority becomes urgency. Approvals and questions go out `critical`, which the notification spec says should stay on screen until you dismiss it; finished tasks go out `low`. Sound names are ignored on Linux; a `toastSound` that is the path of your own audio file does play there (1.8.0 and later).",
          },
          {
            kind: "p",
            text: "On a server, or over SSH with no desktop session, `notify-send` has nowhere to deliver. The toast fails, the failure is logged to `~/.anotifier/errors.log` as `toast:linux`, and ntfy, webhooks, and the bell still deliver. On remote machines, [phone push](/guides/ntfy-phone-notifications/) is the channel to rely on.",
          },
          {
            kind: "ul",
            items: [
              "`anotifier doctor` warns when `notify-send` is missing.",
              "`anotifier doctor --deep` sends a low-urgency toast and reads it back from `dunstctl history` if you run dunst. Other notification daemons report dispatched-but-unverified.",
            ],
          },
        ],
      },
      {
        id: "test",
        title: "Test it",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "anotifier test toast    # prints Toast sent or Toast failed\nanotifier doctor --deep # send a marker and read it back",
          },
          {
            kind: "p",
            text: "If the test works but real notifications don't, the hook is the problem, not the backend: see the [troubleshooting guide](/guides/notifications-not-working/).",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Why don't macOS notifications show the anotifier or agent icon?",
        a: "AppleScript banners always use the icon of the app macOS attributes them to, usually Script Editor or your terminal. anotifier puts the project and agent in the title instead: my-app · Claude Code.",
      },
      {
        q: "Do I need terminal-notifier?",
        a: "No. anotifier only uses osascript, which ships with macOS.",
      },
      {
        q: "Does it work on Wayland?",
        a: "Yes. notify-send talks to the notification daemon over D-Bus, which works the same under Wayland and X11.",
      },
      {
        q: "Can a headless Linux box notify my phone?",
        a: "Yes. Toasts need a desktop, but ntfy push and webhooks work anywhere with network access. Enable ntfy during setup and subscribe to the topic in the ntfy app.",
      },
    ],
  },
  {
    slug: "agent-hooks-explained",
    updated: "2026-11-18",
    kind: "topic",
    name: "Agent hooks",
    title: "Agent Hooks Explained: Claude Code, Codex, Cursor, Gemini",
    description:
      "Which hook events Claude Code, Codex CLI, Cursor and Gemini CLI fire when they finish or need you, where each is configured, and what anotifier writes.",
    h1: "How agent hooks power your notifications",
    intro:
      "Every coding agent anotifier supports can run a command at fixed points in its lifecycle. Those hooks are all anotifier uses: setup adds one entry per event to each agent's own config file, the agent runs it, and the hook turns the event into a notification. No wrapper, no daemon, no polling. This page lists exactly what gets written where, and what happens when a hook fires. Hooks run with your user permissions, so audit them before you trust them.",
    sections: [
      {
        id: "events",
        title: "The events, per agent",
        blocks: [
          {
            kind: "note",
            text: "Wondering whether hooks are safe? That has its own guide: [Claude Code hooks security](/guides/claude-code-hooks-security/) shows where hooks come from, how to audit them with `/hooks`, and how to lock them down.",
          },
          {
            kind: "table",
            head: ["Agent", "Config file", "Finished", "Needs you", "Timeout"],
            rows: [
              [
                "Claude Code",
                "`~/.claude/settings.json`",
                "`Stop`",
                "`Notification`",
                "10 s",
              ],
              [
                "Codex CLI",
                "`~/.codex/hooks.json`",
                "`Stop`",
                "`PermissionRequest`",
                "10 s",
              ],
              ["Cursor", "`~/.cursor/hooks.json`", "`stop`", "None", "Not set"],
              [
                "Gemini CLI",
                "`~/.gemini/settings.json`",
                "`AfterAgent`",
                "`Notification`",
                "30 s",
              ],
            ],
          },
          {
            kind: "p",
            text: 'Codex also gets a `SessionStart` hook. Each agent event maps to one of three anotifier events: `task_complete` (default priority), `needs_input` (urgent), or `session_start` (low, and quiet by default). Claude Code\'s idle reminder ("Claude is waiting for your input") arrives as `needs_input` at default priority instead of urgent. The [docs](/docs/) list every per-event setting.',
          },
        ],
      },
      {
        id: "entry",
        title: "What an entry looks like",
        blocks: [
          {
            kind: "p",
            text: "Every hook runs the same script, `src/notify.mjs` from the installed package, with `--source` naming the agent. This is the Claude Code entry setup writes under both `Stop` and `Notification` (the 1.8.0 timing hook under `UserPromptSubmit` is the same command with a 5-second timeout):",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": [\n    {\n      "type": "command",\n      "command": "node \\"/path/to/anotifier/src/notify.mjs\\" --source claude",\n      "timeout": 10\n    }\n  ],\n  "_managed_by": "anotifier",\n  "matcher": ""\n}',
          },
          {
            kind: "ul",
            items: [
              "**Codex and Cursor** validate their files strictly, so their entries carry no `_managed_by` marker. Instead they pass `--event <name>`, because those agents don't include the event name in the hook's input. Codex entries also set `statusMessage: \"Sending notification\"`.",
              '**Cursor** uses its flat format: `{ "command": "node ... --source cursor --event stop" }` under `hooks.stop`, with `version: 1`.',
              "**Gemini CLI** reads hooks from `settings.json`, not a separate hooks file, and takes its timeout in milliseconds (`30000`). Google's newer **Antigravity CLI**, which replaced Gemini CLI for Google AI Pro and Ultra subscribers in June 2026, reads hooks from its own files (such as `~/.gemini/config/hooks.json`) with different events (`PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`), so Gemini CLI hooks don't carry over. anotifier 1.4.0 and later write an `anotifier` group with a `Stop` handler there.",
            ],
          },
        ],
      },
      {
        id: "delivery",
        title: "What happens when a hook fires",
        blocks: [
          {
            kind: "ol",
            items: [
              "The agent starts `notify.mjs` and writes the event as JSON to its stdin. anotifier waits at most 500 ms for it.",
              "If snooze or quiet hours is active, it stops here and sends nothing. The same goes for a Claude Code `Stop` that fires while background tasks are still running; the real completion notifies later.",
              "Duplicates are dropped. A lock file per agent, event, and session collapses repeats within 1.5 seconds, which matters for Cursor, which can fire `stop` twice for one run.",
              "The notification is built: the title is `my-app · Claude Code`, and for Claude Code the body is the last thing Claude said (or its question), read from the transcript and capped at 180 characters. Other agents send generic text such as `my-app: Task complete`.",
              "Every enabled channel is sent in parallel, each with its own timeout: 5 to 7 seconds for the toast and 5 for ntfy.",
              "The hook exits 0 with the reply the agent expects. For Claude Code that reply rings the terminal bell through Claude Code's own output. Errors go to `~/.anotifier/errors.log`, never into the agent session.",
            ],
          },
        ],
      },
      {
        id: "codex",
        title: "Codex: the feature flag and trust hashes",
        blocks: [
          {
            kind: "p",
            text: "Current Codex releases run hooks by default; early ones needed `hooks = true` under `[features]` in `~/.codex/config.toml`, so setup still sets it and migrates the older `codex_hooks = true` flag. Codex also runs only hooks it trusts. Each hook needs a `trusted_hash` under `[hooks.state]`, keyed by the hooks file path, the event, and the entry's position, and setup writes those too.",
          },
          {
            kind: "code",
            lang: "toml",
            code: "[features]\nhooks = true",
          },
          {
            kind: "p",
            text: "Codex skips a hook without a matching hash, so if you edit one by hand it stops firing until you trust it again with `/hooks` in Codex. Running `npx anotifier@latest setup` again also rewrites the hashes. Hooks fire in the interactive Codex TUI, not in `codex exec`.",
          },
        ],
      },
      {
        id: "safety",
        title: "Backups, re-runs, and uninstall",
        blocks: [
          {
            kind: "ul",
            items: [
              "Before changing a file that already exists, setup copies it to `~/.anotifier/backups/<file>.<timestamp>.backup`.",
              "anotifier recognises its own entries by the marker or by the `notify.mjs` command path, so re-running setup replaces them in place and leaves your own hooks alone.",
              "`anotifier uninstall` asks for confirmation, backs up each file, and removes only anotifier's entries (plus any hook arrays that end up empty) and its Codex trust hashes, and restores your Claude Code statusline (1.5.0 and later). It keeps `~/.anotifier/` with your config and backups, and leaves Codex's `hooks = true` flag set.",
              "The Claude Code plugin registers the same hooks (`Stop`, `Notification` and, from 1.8.0, `UserPromptSubmit`) from inside the plugin. `anotifier uninstall` doesn't touch those; remove the plugin from Claude Code's `/plugin` menu.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Do I need to restart the agent after setup?",
        a: 'Yes. Setup finishes with "Restart your AI tools to activate." A session that was already running may not pick up the new hooks.',
      },
      {
        q: "Can a notification hook slow down or break my agent?",
        a: "anotifier's hook always exits 0 and sends every channel in parallel with short per-channel timeouts, so a dead network or a missing toast tool costs seconds at most and never fails the agent's turn. Failures are written to ~/.anotifier/errors.log.",
      },
      {
        q: "Will setup overwrite hooks I wrote myself?",
        a: "No. It only replaces entries it recognises as its own, and backs up each file before writing.",
      },
      {
        q: "Why does Cursor have no needs-input notification?",
        a: "anotifier registers only Cursor's stop event, which fires when the agent loop ends. Cursor notifications are about finished runs.",
      },
    ],
  },
  {
    slug: "notifications-not-working",
    updated: "2026-11-18",
    kind: "topic",
    name: "Troubleshooting",
    title: "Agent Notifications Not Working? Troubleshooting Guide",
    description:
      "Not getting alerts from Claude Code, Codex, Cursor or Gemini CLI? Check hooks, restarts, snooze, quiet hours, toast backends and ntfy, in that order.",
    h1: "Notifications not arriving? Work through this list",
    intro:
      "When a notification doesn't show up, the cause is almost always one of a few things: the hook isn't wired, the agent wasn't restarted, notifications are paused, or the operating system is hiding the banner. anotifier has three commands that tell you which: `status`, `test`, and `doctor`. Start at the top and stop when you find it. For how the Claude Code hooks work in the first place, see the [Claude Code notifications guide](/guides/claude-code-notifications/).",
    sections: [
      {
        id: "status",
        title: "Step 1: run anotifier status",
        blocks: [
          { kind: "code", lang: "bash", code: "anotifier status" },
          {
            kind: "ul",
            items: [
              "**Tools**: each agent shows `wired` with its events, `not wired`, `not installed`, or `config error`. `not wired` means setup hasn't patched that agent yet: run `npx anotifier@latest setup`. Claude Code only counts as installed once `~/.claude/settings.json` exists, so start Claude Code once before running setup.",
              "**Snooze** and **Quiet hours**: a snooze time, or quiet hours marked `(active now)`, means every channel is silenced on purpose. `anotifier snooze off` ends a snooze early.",
              "**Recent errors**: the last 8 hook errors from `~/.anotifier/errors.log`, each tagged with what failed (`toast:windows`, `toast:linux`, `ntfy`, `webhook`, and so on). Failed WSL toasts are logged as `toast:wsl` since 1.3.0; 1.2.6 and earlier do not log them.",
              "If `status` itself stops with `Config error`, `~/.anotifier/config.json` is invalid JSON or has a bad value. Fix it, or run setup and let it rebuild the file.",
            ],
          },
        ],
      },
      {
        id: "test",
        title: "Step 2: send a test",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "anotifier test           # toast, phone push and bell (plus webhook if enabled)\nanotifier test toast\nanotifier test ntfy\nanotifier test webhook",
          },
          {
            kind: "p",
            text: "`test` sends straight to the channel. It skips the agent's hook, snooze, and quiet hours, which makes the result easy to read:",
          },
          {
            kind: "ul",
            items: [
              "**The test arrives but real notifications don't**: the problem is between the agent and anotifier. Restart the agent (a session started before setup doesn't have the hooks), re-run setup, and check snooze and quiet hours in `status`.",
              "**The test fails too**: the channel itself is broken. `test` exits with code 1 and says which one; continue with step 3.",
            ],
          },
        ],
      },
      {
        id: "doctor",
        title: "Step 3: run anotifier doctor",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "anotifier doctor\nanotifier doctor --deep",
          },
          {
            kind: "table",
            head: ["Check", "What it looks at"],
            rows: [
              [
                "`toast-backend`",
                "The OS toast tool: PowerShell, BurntToast and the execution policy on Windows, `osascript` on macOS, `notify-send` on Linux. Inside WSL, 1.3.0 and later check `wslpath` and a reachable Windows PowerShell; 1.2.6 and earlier check `notify-send`, which WSL toasts never use.",
              ],
              [
                "`toast-auth`",
                "macOS only: whether Notification Center allows the app that shows AppleScript banners.",
              ],
              [
                "`bell`",
                "Whether your terminal will ring. The VS Code and Windsurf terminals swallow the bell.",
              ],
              [
                "`ntfy-config`",
                "Whether a server and topic are set. It does not contact the server; `test ntfy` does.",
              ],
              ["`webhook-config`", "Whether the webhook is set up."],
              ["`config`", "Whether `~/.anotifier/config.json` is valid."],
            ],
          },
          {
            kind: "p",
            text: "`--deep` goes further on macOS and Linux: it sends a real marker notification and reads it back from Notification Center's database (macOS) or dunst's history (Linux). On Windows it reports that deep verification isn't available. `doctor` exits 1 if any check fails, and `--json` prints the results with the check names above.",
          },
        ],
      },
      {
        id: "causes",
        title: "Common causes and fixes",
        blocks: [
          {
            kind: "table",
            head: ["Symptom", "Likely cause", "Fix"],
            rows: [
              [
                "One agent never notifies, `test` works",
                "Hook not wired, or the session started before setup",
                "Run setup, then restart the agent",
              ],
              [
                "Codex never notifies",
                "Hooks flag off, stale trust hashes, or running `codex exec`",
                "Re-run setup; use the interactive TUI. See [agent hooks](/guides/agent-hooks-explained/)",
              ],
              [
                "Codex's own alerts only come when you switch away",
                'Codex\'s built-in notifications default to `notification_condition = "unfocused"`',
                'Set `notification_condition = "always"` under `[tui]`. See [Codex notification sounds](/guides/codex-notification-sound/)',
              ],
              [
                "Claude Code approval alerts arrive a few seconds late",
                "Claude Code holds its `permission_prompt` notification for about six seconds",
                "Expected. See [Claude Code permission notifications](/guides/claude-code-permission-notifications/)",
              ],
              [
                "Nothing at all, for a while",
                "Snooze or quiet hours",
                "`anotifier snooze off`; check `quietHours` in the config",
              ],
              [
                "Windows: `Toast failed`",
                "PowerShell 7 or BurntToast missing",
                "Install PowerShell 7, then re-run setup. See [Windows toast not showing: fixes by symptom](/guides/windows-wsl-notifications/#not-working)",
              ],
              [
                "Windows: `Toast sent`, no banner",
                "Do not disturb (Focus Assist)",
                "**Settings > System > Notifications**. See [Do not disturb and Focus Assist on Windows](/guides/windows-wsl-notifications/#focus-assist)",
              ],
              [
                "WSL: `Toast failed`",
                "Windows interop off, or PowerShell not reachable",
                "See [how the WSL toast reaches Windows](/guides/windows-wsl-notifications/#wsl)",
              ],
              [
                "macOS: `Toast sent`, no banner",
                "Notifications not allowed for Script Editor or your terminal, or a Focus mode",
                "**System Settings > Notifications**. See [macOS & Linux](/guides/macos-linux-notifications/)",
              ],
              [
                "Linux: `Toast failed`",
                "`notify-send` missing, or no desktop session",
                "Install libnotify; on headless machines use ntfy",
              ],
              [
                "Phone stays silent",
                "Not subscribed to the topic, or the topic differs",
                "Compare the ntfy URL in `status` with the app. See [ntfy](/guides/ntfy-phone-notifications/)",
              ],
              [
                "No bell in VS Code",
                "The integrated terminal ignores the bell",
                "Rely on the toast; `doctor` warns about this. See [anotifier in VS Code](/vscode/)",
              ],
            ],
          },
        ],
      },
      {
        id: "report",
        title: "Still stuck?",
        blocks: [
          {
            kind: "p",
            text: "Open an issue on [GitHub](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/issues) with the output of `anotifier doctor --json` and `anotifier status`, plus the matching lines from `~/.anotifier/errors.log`. Remove your ntfy topic first: `status` prints the full ntfy URL (it only shows a webhook's origin).",
          },
          {
            kind: "p",
            text: `For a quick question, or to check whether someone has hit the same thing, ask in the [anotifier Discord](${COMMUNITY_URL}).`,
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Where does anotifier log errors?",
        a: "~/.anotifier/errors.log, one JSON object per line with a timestamp, the failing context (such as toast:macos or ntfy), and the message. The file is capped at 128 KB, keeping the newest half when it grows past that. anotifier status shows the last 8 entries.",
      },
      {
        q: "Does anotifier test respect snooze and quiet hours?",
        a: "No. test always sends, so you can check a channel while notifications are paused. Real hook events do respect both.",
      },
      {
        q: "Why does status say Claude Code is not installed?",
        a: "anotifier looks for ~/.claude/settings.json. Start Claude Code once so it creates the file, then run setup again.",
      },
      {
        q: "I get notifications, but only a generic message. Why?",
        a: "anotifier shows what the agent said for Claude Code only, and only on the toast and webhook by default. ntfy stays generic unless you turn on ntfy.richContent, and Codex, Cursor and Gemini CLI always send generic text: my-app: Task complete for Codex, Gemini CLI and Cursor (Cursor from 1.8.0; earlier versions sent just Task complete).",
      },
    ],
  },
  {
    slug: "ntfy-phone-notifications",
    updated: "2026-11-18",
    kind: "topic",
    name: "ntfy phone push",
    title: "Claude Code ntfy: Phone Alerts When Your Agent Finishes",
    description:
      "Claude Code ntfy setup: install the ntfy app, run npx anotifier setup, or add a Stop hook with curl. Private topics, self-hosting, priority and fixes.",
    h1: "Claude Code ntfy: push to your phone when the agent finishes",
    intro:
      "To get Claude Code to push to your phone through [ntfy](https://ntfy.sh), install the ntfy app, run `npx anotifier@latest setup`, answer yes to phone notifications, and subscribe to the topic it prints. The same topic also carries Codex, Cursor and Gemini CLI. Prefer no tool at all? A `Stop` hook that runs `curl` against your topic does the same for Claude Code alone. ntfy is a free, open-source push service: anything posted to a topic arrives in the app, and there is no account to create. For the hook side in more depth, see the [Claude Code notifications guide](/guides/claude-code-notifications/).",
    sections: [
      {
        id: "setup",
        title: "Quick setup: Claude Code to your phone in two minutes",
        blocks: [
          {
            kind: "ol",
            items: [
              "Install the ntfy app on Android (Google Play or F-Droid) or iOS (App Store).",
              "Run `npx anotifier@latest setup` and answer yes to **Enable phone notifications via ntfy?** Keep the default server, `https://ntfy.sh`, and the generated topic: `anotifier-` followed by 16 random letters and digits. You can type your own topic instead, as long as it is long and hard to guess.",
              "Setup prints the topic and its URL. In the app, subscribe to that topic name.",
              "Run `anotifier test ntfy`. Your phone should buzz within a second.",
            ],
          },
          {
            kind: "p",
            text: "Setup writes the choice to `~/.anotifier/config.json`. You can also edit it yourself, or run `anotifier config ntfy` to change the server, topic, icon and click URL:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "ntfy": {\n    "enabled": true,\n    "server": "https://ntfy.sh",\n    "topic": "anotifier-k3j9x0w7p2m8q4zt"\n  }\n}',
          },
        ],
      },
      {
        id: "by-hand",
        title: "By hand: a Claude Code hook that posts to ntfy",
        blocks: [
          {
            kind: "p",
            text: "Claude Code runs hooks from `~/.claude/settings.json`. The `Stop` hook fires when Claude finishes responding, and the `Notification` hook fires when it needs you; its `matcher` is the notification type, such as `permission_prompt` or `idle_prompt`. Each hook can run `curl` against your topic:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "hooks": {\n    "Stop": [\n      {\n        "hooks": [\n          {\n            "type": "command",\n            "command": "curl -s -o /dev/null -H \'Title: Claude Code\' -d \'Task complete\' https://ntfy.sh/your-long-random-topic"\n          }\n        ]\n      }\n    ],\n    "Notification": [\n      {\n        "matcher": "permission_prompt",\n        "hooks": [\n          {\n            "type": "command",\n            "command": "curl -s -o /dev/null -H \'Title: Claude Code\' -H \'Priority: urgent\' -H \'Tags: warning\' -d \'Needs your permission\' https://ntfy.sh/your-long-random-topic"\n          }\n        ]\n      }\n    ]\n  }\n}',
          },
          {
            kind: "ul",
            items: [
              "Replace `your-long-random-topic` with a name nobody could guess, and subscribe to it in the app.",
              "`-s -o /dev/null` keeps ntfy's JSON reply off the hook's output. That suits a Unix shell; in Windows PowerShell 5.1 run `curl.exe`, because `curl` is an alias for `Invoke-WebRequest` there.",
              "Use fixed text like the above. Anyone who knows a public ntfy.sh topic can read it, so keep conversation content out of the body.",
              "Add a `Notification` entry per type you care about. Without a `matcher`, the hook runs for every notification type, including ones that wait on nothing, such as a finished login.",
              "Codex, Cursor and Gemini CLI have their own hook files. The [agent hooks guide](/guides/agent-hooks-explained/) lists where each one lives.",
            ],
          },
          {
            kind: "p",
            text: "That is the whole mechanism. anotifier adds the project name to the title, a sensible priority per event, a quieter idle reminder, snooze and quiet hours, one setup for every agent, and a fallback server.",
          },
        ],
      },
      {
        id: "what",
        title: "What arrives on your phone",
        blocks: [
          {
            kind: "table",
            head: ["Event", "ntfy priority", "Tags"],
            rows: [
              ["Task finished", "default", "`white_check_mark`"],
              ["Approval or question", "urgent", "`bell`, `warning`"],
              [
                "Claude Code idle reminder",
                "default",
                "`hourglass_flowing_sand`",
              ],
              [
                "Claude Code notice that waits on nothing, such as a finished background agent",
                "default",
                "`information_source`",
              ],
              ["Session start", "not sent", "None"],
            ],
          },
          {
            kind: "p",
            text: "The title is `my-app · Claude Code`, sent encoded so accents and emoji in project names survive. The body is generic text such as `my-app: Task complete`: anotifier keeps conversation text out of ntfy by default (`ntfy.richContent` is `false`), because anyone who knows a public topic name can read it.",
          },
        ],
      },
      {
        id: "priority",
        title: "Priority and tags",
        blocks: [
          {
            kind: "p",
            text: "ntfy has five priorities, set with the `Priority` header (aliases `X-Priority`, `prio` and `p`): `5` or `max`/`urgent`, `4` high, `3` default, `2` low and `1` min. Tags go in the `Tags` header (alias `X-Tags`); a tag that matches an emoji short code, like `warning`, is shown as that emoji.",
          },
          {
            kind: "p",
            text: "In anotifier both are per event in `~/.anotifier/config.json`. `priority` takes `min`, `low`, `default`, `high` or `urgent`, `ntfyTags` is a comma-separated list, and `ntfyEnabled: false` turns the phone push off for one event:",
          },
          {
            kind: "code",
            lang: "json",
            code: '{\n  "events": {\n    "task_complete": { "priority": "low", "ntfyTags": "tada" },\n    "needs_input": { "priority": "high", "idleReminderPriority": "min" },\n    "session_start": { "ntfyEnabled": true }\n  }\n}',
          },
          {
            kind: "p",
            text: "`idleReminderPriority` sets the level of Claude Code's idle reminder, which is `default` unless you change it.",
          },
        ],
      },
      {
        id: "private",
        title: "Private topics and access tokens",
        blocks: [
          {
            kind: "ul",
            items: [
              "On ntfy.sh, a topic with no access rules is readable by anyone who knows its name: ntfy's FAQ says the topic name is your password, and a randomly generated one is as good as a good password. The generated 16-character name is hard to guess; don't replace it with something short like `claude`.",
              "Keep the topic out of public issues and screenshots. `anotifier status` prints the full ntfy URL.",
              "Want Claude's actual words on your phone? Run your own ntfy server and turn on `richContent` for it (below).",
            ],
          },
          {
            kind: "p",
            text: "ntfy can also protect a topic with a username and password or an access token (`Authorization: Bearer tk_…`). anotifier (as of 1.8.0) has no config key for either: it never sends an `Authorization` header to ntfy, so the server has to accept anonymous publishing to your topic. The pattern that keeps your messages private on your own server is to deny anonymous reads and allow anonymous writes to that one topic (`server.yml`, then the `ntfy` command), and to sign in to the server in the ntfy app as that user so your phone can read:",
          },
          {
            kind: "code",
            lang: "yaml",
            code: '# server.yml\nauth-file: "/var/lib/ntfy/user.db"\nauth-default-access: "deny-all"\n\n# then, on the server\nntfy user add phone\nntfy access phone anotifier-your-topic read-only\nntfy access everyone anotifier-your-topic write-only',
          },
          {
            kind: "p",
            text: "Anyone who learns the topic name can then post to it, but cannot read it. The by-hand hook above has no such limit: add `-H 'Authorization: Bearer tk_…'` to its `curl` and it publishes to a protected topic.",
          },
        ],
      },
      {
        id: "self-host",
        title: "Use your own ntfy server",
        blocks: [
          {
            kind: "code",
            lang: "json",
            code: '{\n  "ntfy": {\n    "enabled": true,\n    "server": "https://ntfy.example.com",\n    "fallbackServer": "https://ntfy.sh",\n    "topic": "anotifier-your-topic",\n    "click": "",\n    "richContent": true\n  }\n}',
          },
          {
            kind: "ul",
            items: [
              "Any ntfy server works, over https or http; a trailing slash is ignored. Include the scheme: a bare `ntfy.example.com` is logged as an invalid URL.",
              "`fallbackServer` (1.7.0 and later) is a second server for the same topic. If `server` is unreachable, times out or answers with an error such as a 429 limit, the same push is sent there once. Subscribe your phone to the topic on both servers. A fallback shortens each attempt from 5 to 3 seconds, and if the main server accepts a push but answers slowly, the fallback sends it too, so a phone subscribed on both can buzz twice.",
              "`click` is an optional URL to open when you tap the notification.",
              "`anotifier config ntfy` edits the server, topic, icon, and click URL interactively. `fallbackServer` and `richContent` are only set in `~/.anotifier/config.json`.",
              'On iOS, a self-hosted server needs `upstream-base-url: "https://ntfy.sh"` in its `server.yml`, or notifications can take hours to arrive. Only a poll request with a message ID goes upstream, not the message.',
              "Setting up the server itself is covered in [ntfy's install docs](https://docs.ntfy.sh/install/): `ntfy serve`, or the `binwiederhier/ntfy` Docker image.",
            ],
          },
        ],
      },
      {
        id: "test",
        title: "Test it with one line of curl",
        blocks: [
          {
            kind: "code",
            lang: "bash",
            code: "curl -H 'Title: Test' -H 'Priority: urgent' -H 'Tags: warning' -d 'Hello from curl' https://ntfy.sh/your-long-random-topic",
          },
          {
            kind: "p",
            text: "If that arrives, the app and topic are right and any remaining problem is in the hook. Then check anotifier itself: `anotifier test ntfy` sends a test push through your real config and prints `ntfy sent`, `ntfy failed` or `ntfy not configured`. If only the fallback delivered it, the output says so. `anotifier test` ignores snooze and quiet hours, so it works while notifications are paused. In Windows PowerShell 5.1, run the curl line as `curl.exe`.",
          },
        ],
      },
      {
        id: "trouble",
        title: "When the phone stays silent",
        blocks: [
          {
            kind: "ul",
            items: [
              "`anotifier test ntfy` prints `ntfy not configured` if ntfy was skipped during setup: run setup again, or `anotifier config ntfy`.",
              "`ntfy failed`: check the server URL, then look in `~/.anotifier/errors.log` for `ntfy server responded <code>`, `ntfy server is not a valid URL` or a timeout (anotifier gives ntfy 5 seconds, or 3 with a fallback server).",
              "A topic typo is the commonest cause. `anotifier status` prints the exact server and topic anotifier posts to; compare it character by character with the subscription in the app.",
              "iOS is slow or shows only `New message`: on a self-hosted server, set `upstream-base-url` as above. ntfy's docs say that without it notifications can take hours, and `New message` usually means the iPhone cannot reach your server. ntfy also lists a known iOS issue where the list does not refresh until you swipe down.",
              'Android is delayed on a self-hosted server: the Google Play app uses Firebase only for ntfy.sh, so for your own server it relies on instant delivery, a foreground service shown as a permanent notification. Without it messages "may arrive with a significant delay" (sometimes many minutes, or even hours). The F-Droid build always uses instant delivery.',
              "Everything is silent at once: `anotifier snooze` and quiet hours silence every channel, ntfy included. `anotifier status` shows the state.",
              "ntfy.sh is a free public service with its own limits, such as 250 messages a day; normal agent traffic stays well below them, but a script firing many pushes can hit them. Set a `fallbackServer`, or run your own server, whose limits you choose.",
              "The test arrives but real events don't: the hook is the problem. See the [troubleshooting guide](/guides/notifications-not-working/).",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I get Claude Code to send ntfy notifications?",
        a: "Install the ntfy app, run npx anotifier@latest setup and answer yes to phone notifications, then subscribe to the topic it prints. Or add a Stop hook to ~/.claude/settings.json that runs curl -d 'Task complete' against https://ntfy.sh/your-topic.",
      },
      {
        q: "Is ntfy free, and do I need an account?",
        a: "ntfy is open source, the public ntfy.sh server is free to use, and you can run your own server instead. You subscribe to a topic name in the app; there is nothing to sign up for.",
      },
      {
        q: "Does this work for Codex, Cursor and Gemini CLI too?",
        a: "Yes. Setup wires every agent it finds to the same ntfy topic, so all of them land in one stream. Their alerts carry generic text, and the title names the project where the agent reports one.",
      },
      {
        q: "Can I use an ntfy access token or password?",
        a: "Not in anotifier (as of 1.8.0), which sends no Authorization header to ntfy. Use a server that allows anonymous writes to your topic and denies anonymous reads. Your own curl hook can send a Bearer token.",
      },
      {
        q: "Can I use my own ntfy server?",
        a: "Yes. Set ntfy.server in ~/.anotifier/config.json, and optionally ntfy.fallbackServer, which is tried once if the main server fails. On iOS, set upstream-base-url on your server.",
      },
      {
        q: "Can several machines use the same topic?",
        a: "Yes. Enter the same topic during setup on each machine. Every notification title names the project, so you can tell runs apart.",
      },
      {
        q: "Can I approve a Codex or Claude Code permission from my phone?",
        a: "Not with anotifier (as of 1.8.0). The urgent push gets you back to the keyboard fast; the decision itself stays in the terminal.",
      },
    ],
  },
];
