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
    .replace(INVISIBLE_RE, codePointMarker);
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
//   NAME=value where NAME contains secret|token|key|pass|pwd|auth|cred
//   Authorization: header values, and Bearer/Basic/Token credentials
//   credentials in URLs (scheme://user:pass@)
//   runs of 32+ base64/hex characters (with at least one digit and one
//   letter, so long plain words and paths without digits survive)
// KNOWN MISSES (asserted as misses in tests so the docs stay honest):
//   secrets as separate arguments (--token abc123, --password hunter2),
//   glued short flags (mysql -pSECRET), short passwords anywhere, secrets in
//   positional arguments, and any format these patterns do not know.
const SECRET_NAME_RE = /secret|token|key|pass|pwd|auth|cred/i;

export function redacted(n) {
  return `[redacted ${n} chars]`;
}

export function scrubSecrets(input) {
  let s = String(input ?? '');
  // URL credentials first: user:pass@ inside a URL.
  s = s.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+:[^\s/@]+)@/gi, (_, scheme, cred) => `${scheme}${redacted(cred.length)}@`);
  // Authorization header values, with or without a scheme word.
  s = s.replace(/(authorization\s*[:=]\s*)((?:bearer|basic|token|digest)\s+)?([^\s"']+)/gi,
    (_, head, scheme = '', value) => `${head}${scheme}${redacted(value.length)}`);
  // A bare Bearer/Basic credential elsewhere (curl -H "...: Bearer x", tools that take one).
  s = s.replace(/\b(bearer|basic)(\s+)(?!\[redacted)([A-Za-z0-9._~+/=-]{8,})/gi,
    (_, scheme, sp, value) => `${scheme}${sp}${redacted(value.length)}`);
  // NAME=value with a secret-looking name. The value is one shell word:
  // a quoted string or a run of non-separator characters.
  s = s.replace(/\b([A-Za-z_][A-Za-z0-9_.-]*)=("[^"]*"|'[^']*'|[^\s"';&|<>()`]+)/g, (whole, name, value) => {
    if (!SECRET_NAME_RE.test(name) || value.startsWith('[redacted')) return whole;
    return `${name}=${redacted(value.length)}`;
  });
  // Long opaque runs: keys, hashes, base64 payloads.
  s = s.replace(/[A-Za-z0-9+/_=-]{32,}/g, (run) => (/\d/.test(run) && /[A-Za-z]/.test(run) ? redacted(run.length) : run));
  return s;
}

// ── Display budget (design 2.8 table) ───────────────────────────────
// Code points of the scrubbed, rendered command. Beyond the budget the text
// is cut AND the Approve button is withheld: a command the user cannot read
// in full is not approvable from the phone (T11). The byte cap keeps the whole
// message under ntfy's 4096-byte limit, past which ntfy would turn it into an
// attachment.
export const DISPLAY_BUDGET = { summary: 300, full: 1500 };
const DISPLAY_BYTE_CAP = 3000;

// { text, fits }. `fits` false means: do not offer Approve.
export function bashDisplay(command, { mode = 'summary', home = '' } = {}) {
  if (mode === 'minimal') return { text: 'Bash command', fits: true };
  const budget = DISPLAY_BUDGET[mode] || DISPLAY_BUDGET.summary;
  const text = renderVisible(scrubSecrets(tildeHome(command, home)));
  const chars = [...text];
  if (chars.length <= budget && Buffer.byteLength(text, 'utf8') <= DISPLAY_BYTE_CAP) return { text, fits: true };
  let cut = chars.slice(0, budget).join('');
  while (Buffer.byteLength(cut, 'utf8') > DISPLAY_BYTE_CAP) cut = [...cut].slice(0, -50).join('');
  const hidden = chars.length - [...cut].length;
  return { text: `${cut} … [${hidden} more chars not shown]`, fits: false };
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
