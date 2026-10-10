import https from 'node:https';
import http from 'node:http';
import { logHookError } from './error-log.mjs';

// HTTP header values are bytes, not text: node writes them as latin-1 and
// throws ERR_INVALID_CHAR on anything above U+00FF, so a title carrying the
// "project · label" separator (U+00B7) or a non-ASCII project name would either
// arrive as mojibake or kill the whole request. ntfy documents RFC 2047 for
// exactly this: `=?UTF-8?B?<base64>?=` is decoded server-side before display.
// Pure-ASCII titles are sent verbatim so existing wire assertions hold.
export function encodeHeaderValue(value) {
  const str = String(value ?? '');
  if (/^[\x20-\x7e]*$/.test(str)) return str;
  return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`;
}

export function buildNtfyRequest(ntfyConfig, notification) {
  const server = (ntfyConfig.server || 'https://ntfy.sh').replace(/\/+$/, '');
  const url = `${server}/${ntfyConfig.topic}`;

  const headers = {
    Title: encodeHeaderValue(notification.title),
    Priority: notification.priority || 'default',
  };

  if (notification.ntfyTags) headers.Tags = notification.ntfyTags;
  if (notification.icon) headers.Icon = notification.icon;
  else if (ntfyConfig.icon) headers.Icon = ntfyConfig.icon;
  if (ntfyConfig.click) headers.Click = ntfyConfig.click;

  return { url, headers, body: notification.message };
}

// Per-request timeout. With a fallback server configured, each attempt gets
// less so both fit together inside the hook's 10 s budget (hooks.json), next
// to the Windows toast's 7 s.
const TIMEOUT_MS = 5000;
const TIMEOUT_WITH_FALLBACK_MS = 3000;

const normalizeServer = (s) => String(s || '').trim().replace(/\/+$/, '');

// Send to ntfyConfig.server, and if that fails and ntfyConfig.fallbackServer
// is set (and differs), send the same message once to the fallback with the
// same topic. Resolves true when either delivered. Never throws.
export async function sendNtfy(ntfyConfig, notification) {
  return (await sendNtfyDetailed(ntfyConfig, notification)).ok;
}

// sendNtfy that also says which server delivered: { ok, via, fallback } with
// via 'server', 'fallback' or null. `anotifier test ntfy` uses it so a dead
// main server is not hidden behind a working fallback.
export async function sendNtfyDetailed(ntfyConfig, notification) {
  if (!ntfyConfig.topic) {
    logHookError('ntfy', new Error('ntfy is enabled but no topic is configured'));
    return { ok: false, via: null, fallback: null };
  }
  const primary = normalizeServer(ntfyConfig.server) || 'https://ntfy.sh';
  const fallback = normalizeServer(ntfyConfig.fallbackServer);
  const hasFallback = Boolean(fallback) && fallback !== primary;
  const timeoutMs = hasFallback ? TIMEOUT_WITH_FALLBACK_MS : TIMEOUT_MS;

  if (await postNtfy(ntfyConfig, notification, timeoutMs, 'ntfy')) return { ok: true, via: 'server', fallback: null };
  if (!hasFallback) return { ok: false, via: null, fallback: null };
  const ok = await postNtfy({ ...ntfyConfig, server: fallback }, notification, timeoutMs, 'ntfy:fallback');
  return { ok, via: ok ? 'fallback' : null, fallback };
}

function postNtfy(ntfyConfig, notification, timeoutMs, context) {
  return new Promise((resolve) => {
    const { url, headers, body } = buildNtfyRequest(ntfyConfig, notification);

    // A bare-hostname typo (server: "ntfy.sh" with no scheme) makes `new URL`
    // throw, which would break this module's resolve-false-never-throw contract
    // and crash `anotifier test ntfy` with a raw "Invalid URL" (mirrors webhook.mjs).
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      logHookError(context, new Error(`ntfy server is not a valid URL: ${ntfyConfig.server || 'https://ntfy.sh'}`));
      resolve(false);
      return;
    }
    const transport = parsed.protocol === 'https:' ? https : http;

    let done = false;
    let timer;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) logHookError(context, err, { url: parsed.origin });
      resolve(ok);
    };

    // transport.request can throw SYNCHRONOUSLY (not via 'error') on a non-http(s)
    // protocol that still parses (e.g. ftp://) or invalid header chars — guard the
    // whole setup so a bad config can never reject this promise (see webhook.mjs).
    try {
      const req = transport.request(parsed, {
        method: 'POST',
        agent: false, // no keep-alive socket may outlive the hook's process.exit() (see sentry.mjs)
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      }, (res) => {
        res.resume(); // drain
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        finish(ok, ok ? null : new Error(`ntfy server responded ${res.statusCode}`));
      });

      // One deadline for the whole attempt (DNS, connect, response headers).
      // The socket `timeout` option is only an idle timer, which a server
      // sending a byte at a time could keep alive far past the hook's budget.
      timer = setTimeout(() => {
        finish(false, new Error(`ntfy request timed out after ${timeoutMs}ms`));
        req.destroy();
      }, timeoutMs);
      req.on('error', (err) => finish(false, err));
      req.end(body);
    } catch (err) {
      finish(false, err);
    }
  });
}
