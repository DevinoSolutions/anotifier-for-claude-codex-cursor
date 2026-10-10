// src/approval-display.mjs — what the phone is shown for a remote approval,
// and which Bash commands are never offered there (design 2.8 and 4.3).
//
// Two rules drive everything here:
//   1. Nothing is silently deleted. A newline becomes a visible ⏎, and every
//      control, bidi, zero-width or other invisible character becomes a
//      [U+XXXX] marker, so a command cannot look shorter or more harmless on
//      the phone than it is (T11).
//   2. Every redaction is visible too ([redacted N chars]), so a payload
//      hidden in a long blob looks suspicious rather than invisible.
// Secret scrubbing is a HEURISTIC, not a guarantee; see KNOWN MISSES below.

// ── Rendering (design 2.8, "Rendering rules") ───────────────────────
// Characters that must never reach the phone as themselves:
//   \p{Cc}  C0, DEL and C1 controls (tab and newlines are handled first)
//   \p{Cf}  format characters: every bidi control (U+202A-202E, U+2066-2069,
//           U+200E, U+200F, U+061C), zero-width (U+200B-200D, U+2060, U+FEFF),
//           the soft hyphen U+00AD, tag characters, and the rest of the class
//   \p{Zl} \p{Zp}  U+2028 / U+2029, which some renderers break lines on
//   \p{Zs}  every space other than U+0020: a no-break space between two words
//           looks like a separator but is part of one shell word
//   \p{Cs}  lone surrogates
//   plus the invisible fillers (U+034F, U+115F, U+1160, U+17B4, U+17B5,
//   U+3164, U+FFA0) and the variation selectors.
const INVISIBLE_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}͏ᅟᅠ឴឵ㅤﾠ︀-️\u{E0100}-\u{E01EF}]|(?! )\p{Zs}/gu;

export const NEWLINE_MARKER = ' ⏎ ';

export function codePointMarker(ch) {
  return `[U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}]`;
}

// Lone surrogates: a JS string from JSON can hold them, and the u-flag regex
// above only sees them one at a time, which is what we want.
export function renderVisible(input) {
  return String(input ?? '')
    .replace(/\r\n|\r|\n/g, NEWLINE_MARKER)
    .replace(/\t/g, ' ')
    .replace(URL_AUTHORITY_RE, markNonAscii)
    .replace(INVISIBLE_RE, codePointMarker)
    .replace(RTL_RE, codePointMarker);
}

// Right-to-left letters (Bidi_Class R / AL, and Arabic numbers) reorder the
// text around them on screen, so a command can read differently from how it
// runs. JavaScript regexes have no Bidi_Class property, so this is the set of
// blocks that hold them: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan,
// Mandaic and the Arabic extensions (U+0590-U+08FF), the Hebrew and Arabic
// presentation forms (U+FB1D-U+FDFF, U+FE70-U+FEFE), and the right-to-left
// scripts of the SMP (U+10800-U+10FFF, U+1E800-U+1EFFF). Slightly wider than
// the exact class on purpose: a marker is the safe direction. Ordinary
// accented Latin, Greek, Cyrillic and CJK are not in it and stay readable.
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFE\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/gu;

// A non-ASCII character inside the host part of a URL (`scheme://host`): a
// lookalike letter turns github.com into a different server. Everything
// non-ASCII there becomes a marker, whatever script it is in. The authority
// ends at a path, query, fragment, backslash, quote or shell separator.
const URL_AUTHORITY_RE = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/?#\\"'<>|;&()`]*/giu;

function markNonAscii(authority) {
  return authority.replace(/[^\x00-\x7f]/gu, codePointMarker);
}

// ── Home directory → ~ ──────────────────────────────────────────────
export function tildeHome(input, home) {
  const s = String(input ?? '');
  if (!home || home.length < 2) return s;
  const variants = new Set([home, home.replace(/\\/g, '/')]);
  let out = s;
  for (const v of variants) out = out.split(v).join('~');
  return out;
}

// ── Secret scrubbing (design 2.8) ───────────────────────────────────
// Covered:
//   NAME=value where NAME has a whole segment that names a secret (API_KEY,
//     GH_TOKEN, PGPASSWORD, AUTH_HEADER, apiKey; not MONKEY or KEYBOARD)
//   Authorization: header values, and Bearer/Basic/Token credentials
//   credentials in URLs (scheme://user:pass@)
//   runs of 32+ base64/hex characters (with at least one digit and one
//   letter, so long plain words survive), unless the run is part of a path
// NEVER redacted, whatever the name: a value that holds shell syntax that
// would run or chain something ($(, ${, a backtick, a newline, ; | & < >).
// A redaction must not be able to swallow what executes (review of PR #96,
// H1); such a value is shown as it is. As defence in depth, if a redaction
// ever did cover such syntax the command no longer fits, so Approve is
// withheld (see scrubDetailed).
// KNOWN MISSES (asserted as misses in tests so the docs stay honest):
//   secrets as separate arguments (--token abc123, --password hunter2),
//   glued short flags (mysql -pSECRET), short passwords anywhere, secrets in
//   positional arguments, and any format these patterns do not know.
const SECRET_WORD_RE = /^(?:key|keys|pass|pwd|auth|authorization|cred|creds|credential|credentials|apikey|accesskey|secretkey|privatekey|\w*?(?:secret|token|password|passwd)s?)$/i;

// True when NAME names a secret by a whole segment. Segments split on _ - .
// and on lower-to-upper camelCase boundaries.
export function isSecretName(name) {
  return String(name)
    .split(/[_.\-]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .some((seg) => SECRET_WORD_RE.test(seg));
}

// Shell syntax that runs or chains something. A value holding any of it is
// never redacted.
const SHELL_META_RE = /\$[({]|[`\n\r;|&<>]/;
export function hasShellMeta(value) {
  return SHELL_META_RE.test(String(value));
}

export function redacted(n) {
  return `[redacted ${n} chars]`;
}

// bashDisplay scrubs only this much of a command: the rest is far over
// the display budget, Approve is withheld anyway, and the scrubbing patterns
// must not be handed 100 KB of adversarial input (review of PR #96, L1).
const SCRUB_INPUT_CAP = 6000;

// { text, unsafe }. unsafe: a redaction covered shell syntax. The guard makes
// that unreachable; if it ever happens the caller withholds Approve.
// { guard: false } switches the guard off so tests can exercise that path.
export function scrubDetailed(input, { guard = true } = {}) {
  let s = String(input ?? '');
  let unsafe = false;
  // The one place a redaction marker is made. null: the value stays visible.
  const redact = (value) => {
    const meta = hasShellMeta(value);
    if (meta && guard) return null;
    if (meta) unsafe = true;
    return redacted(value.length);
  };
  // URL credentials first: user:pass@ inside a URL.
  s = s.replace(/\b([a-z][a-z0-9+.-]{0,31}:\/\/)([^\s/@:]{1,256}:[^\s/@]{1,256})@/gi, (whole, scheme, cred) => {
    const r = redact(cred);
    return r === null ? whole : `${scheme}${r}@`;
  });
  // Authorization header values, with or without a scheme word.
  s = s.replace(/(authorization\s*[:=]\s*)((?:bearer|basic|token|digest)\s+)?([^\s"']+)/gi, (whole, head, scheme = '', value) => {
    const r = redact(value);
    return r === null ? whole : `${head}${scheme}${r}`;
  });
  // A bare Bearer/Basic credential elsewhere (curl -H "...: Bearer x", tools that take one).
  s = s.replace(/\b(bearer|basic)(\s+)(?!\[redacted)([A-Za-z0-9._~+/=-]{8,})/gi, (whole, scheme, sp, value) => {
    const r = redact(value);
    return r === null ? whole : `${scheme}${sp}${r}`;
  });
  // NAME=value with a secret-looking name. The value is one shell word: a
  // quoted string or a run of non-separator characters. "$(" and "${" are
  // part of an unquoted word so that they are seen (the value is then left
  // alone). A double-quoted value may hold \" escapes.
  s = s.replace(/\b([A-Za-z_][A-Za-z0-9_.-]{0,63})=("(?:[^"\\]|\\[^])*"|'[^']*'|(?:\$[({]|[^\s"';&|<>()`])+)/g, (whole, name, value) => {
    if (!isSecretName(name) || value.startsWith('[redacted')) return whole;
    const r = redact(value);
    return r === null ? whole : `${name}=${r}`;
  });
  // Long opaque runs: keys, hashes, base64 payloads. Never a path: a run with
  // a / or \ in it, or right after a ~ or a \, is a location the user needs
  // to read (rm -rf /home/me/client-work-2024-backups).
  s = s.replace(/[A-Za-z0-9+/_=-]{32,}/g, (run, offset, whole) => {
    if (!(/\d/.test(run) && /[A-Za-z]/.test(run))) return run;
    if (/[/\\]/.test(run)) return run;
    if (offset > 0 && /[~\\]/.test(whole[offset - 1])) return run;
    const r = redact(run);
    return r === null ? run : r;
  });
  return { text: s, unsafe };
}

export function scrubSecrets(input) {
  return scrubDetailed(input).text;
}

// ── Display budget (design 2.8 table) ───────────────────────────────
// Code points of the scrubbed, rendered command. Beyond the budget the text
// is cut AND the Approve button is withheld: a command the user cannot read
// in full is not approvable from the phone (T11). The byte cap keeps the whole
// message under ntfy's 4096-byte limit, past which ntfy would turn it into an
// attachment.
export const DISPLAY_BUDGET = { summary: 300, full: 1500 };
const DISPLAY_BYTE_CAP = 3000;

// { text, fits, reason? }. `fits` false means: do not offer Approve; `reason`
// then says why: 'minimal' (the mode shows no command at all, so there is
// nothing to approve), 'long' (over the budget) or 'redaction' (a redaction
// covered shell syntax, which the scrubber is built never to do).
export function bashDisplay(command, { mode = 'summary', home = '' } = {}) {
  // minimal shows no command, so the user cannot see what would run: Approve
  // is withheld and only Deny / "At terminal" are offered (review of PR #96, L7).
  if (mode === 'minimal') return { text: 'Bash command', fits: false, reason: 'minimal' };
  const budget = DISPLAY_BUDGET[mode] || DISPLAY_BUDGET.summary;
  const source = tildeHome(command, home);
  // Far over the budget: only the head can ever be shown, so only the head is
  // scrubbed (bounded work, review of PR #96, L1). Approve is withheld below.
  const head = source.length > SCRUB_INPUT_CAP ? source.slice(0, SCRUB_INPUT_CAP) : source;
  const unscanned = source.length - head.length;
  const scrubbed = scrubDetailed(head);
  const text = renderVisible(scrubbed.text);
  const chars = [...text];
  if (!unscanned && !scrubbed.unsafe && chars.length <= budget && Buffer.byteLength(text, 'utf8') <= DISPLAY_BYTE_CAP) {
    return { text, fits: true };
  }
  let cut = chars.slice(0, budget).join('');
  while (Buffer.byteLength(cut, 'utf8') > DISPLAY_BYTE_CAP) cut = [...cut].slice(0, -50).join('');
  const hidden = chars.length - [...cut].length + unscanned;
  if (hidden <= 0) return { text: cut, fits: false, reason: 'redaction' };
  return { text: `${cut} … [${hidden} more chars not shown]`, fits: false, reason: 'long' };
}

// A short label for titles: rendered, single line, bounded.
export function shortLabel(input, max = 60) {
  const chars = [...renderVisible(input)];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

// ── Bash commands never offered remotely (design 4.3) ───────────────
// The built-in path denylist exists because a write to these places becomes
// code execution later, outside any permission prompt. For a Bash command we
// cannot tell a read from a write, so ANY mention sends the request to the
// terminal. This is conservative and easy to evade (a variable, an alias, a
// script that writes the file); the user still sees the whole command, and
// it is never a reason to approve something. Matched case-insensitively.
export const BASH_PATH_DENYLIST = [
  { re: /\.claude(?:[\\/]|\b)/i, why: 'Claude Code settings and hooks' },
  { re: /\.codex(?:[\\/]|\b)/i, why: 'Codex hooks and config' },
  { re: /\.anotifier(?:[\\/]|\b)/i, why: 'anotifier config and approval state' },
  { re: /\.git[\\/](?:hooks|config)\b/i, why: 'git hooks and git config' },
  { re: /\bcore\.(?:hookspath|fsmonitor)\b/i, why: 'git hook settings' },
  { re: /\.husky(?:[\\/]|\b)|\.pre-commit-config\.ya?ml|\blefthook\.ya?ml/i, why: 'git hook managers' },
  { re: /\.(?:bashrc|bash_profile|bash_login|profile|zshrc|zprofile|zshenv|zlogin|envrc)\b|\bconfig\.fish\b|profile\.ps1\b/i, why: 'shell startup files' },
  { re: /\.github[\\/]workflows|\.gitlab-ci\.ya?ml|\.circleci(?:[\\/]|\b)/i, why: 'CI workflows' },
  { re: /\bpackage\.json\b|\.npmrc\b|\.yarnrc(?:\.ya?ml)?\b/i, why: 'package scripts and registry config' },
  { re: /\.vscode[\\/](?:tasks|settings)\.json/i, why: 'editor tasks' },
  { re: /\.ssh(?:[\\/]|\b)|\bauthorized_keys\b/i, why: 'SSH keys' },
  { re: /\bcrontab\b/i, why: 'scheduled jobs' },
];

// The reason a command is denylisted, or null.
export function bashDenylistHit(command) {
  const s = String(command ?? '');
  for (const { re, why } of BASH_PATH_DENYLIST) if (re.test(s)) return why;
  return null;
}

// approval.neverRemote: command prefixes the user never wants answered from
// the phone (design 4.3). Checked against every simple command in the line,
// split on ; & | and newlines, after whitespace is collapsed. A convenience,
// not a security boundary: shell prefix matching is easy to evade.
export function neverRemoteHit(command, prefixes = []) {
  if (!prefixes.length) return false;
  const norm = (x) => String(x).replace(/\s+/g, ' ').trim().toLowerCase();
  const segments = String(command ?? '').split(/[;&|\n\r]+/).map(norm).filter(Boolean);
  const wanted = prefixes.map(norm).filter(Boolean);
  // Plain startsWith, so "sudo" also catches "sudo-rs": erring toward the
  // terminal is the safe direction.
  return segments.some((seg) => wanted.some((p) => seg.startsWith(p)));
}
