/**
 * Helpers the content data files share. They live here, not in a guide file,
 * so a guide can be split, renamed or removed without breaking the others.
 */

/** A JSON code sample, pretty-printed the way every guide shows it. */
export const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The `commandWindows` for a hook that plays one of the stock Windows sounds. */
export const WINDOWS_SOUND = (file: string) =>
  `powershell.exe -NoProfile -Command "(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\${file}').PlaySync()"`;

/**
 * The AppUserModelID of Windows PowerShell. A toast shown under it needs no
 * registered app of its own, which is why every script below uses it.
 */
const WIN_TOAST_APP_ID =
  "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/**
 * The part every WinRT toast script on the site shares: load the two types,
 * name the app, build the two-line template and get its text nodes. No module,
 * runs on Windows PowerShell 5.1.
 */
export const WIN_TOAST_PRELUDE = `$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$AppId = '${WIN_TOAST_APP_ID}'
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $xml.GetElementsByTagName('text')`;

/** The parameterised toast script (-Title, -Message) the WSL and Codex guides print. */
export const winToastParamScript = (defaultTitle: string) => `param(
  [string]$Title = '${defaultTitle}',
  [string]$Message = 'Done'
)
$ErrorActionPreference = 'Stop'
${WIN_TOAST_PRELUDE}
$null = $texts.Item(0).AppendChild($xml.CreateTextNode($Title))
$null = $texts.Item(1).AppendChild($xml.CreateTextNode($Message))
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)`;
