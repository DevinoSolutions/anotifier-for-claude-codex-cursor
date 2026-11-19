/**
 * Helpers the content data files share. They live here, not in a guide file,
 * so a guide can be split, renamed or removed without breaking the others.
 */

/** A JSON code sample, pretty-printed the way every guide shows it. */
export const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The `commandWindows` for a hook that plays one of the stock Windows sounds. */
export const WINDOWS_SOUND = (file: string) =>
  `powershell.exe -NoProfile -Command "(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\${file}').PlaySync()"`;
