// src/sentry.mjs — Minimal Sentry client over the envelope HTTP API.
// Deliberately SDK-free: the package's zero-dependency guarantee applies to
// error reporting too. Only used when the user opts in via config.sentry.
//
// Transport is node:https with agent:false, NOT fetch: undici's keep-alive
// socket pool trips a libuv assertion (0xC0000409) on Windows when the hook
// calls process.exit() right after sending — same proven pattern as ntfy.mjs.
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const SEND_TIMEOUT_MS = 1500; // hook budget is 10s total; never let Sentry block a notification

// DSN format: https://<publicKey>@<host>/<projectId>
export function parseSentryDsn(dsn) {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, '');
    if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

export function buildErrorEvent({ context, error, extra }) {
  const eventId = randomUUID().replaceAll('-', '');
  const event = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    logger: context || 'hook',
    release: `${pkg.name}@${pkg.version}`,
    environment: os.platform(),
    tags: { context: context || 'hook' },
    exception: {
      values: [
        {
          type: (error && error.name) || 'Error',
          value: (error && error.message) || String(error),
        },
      ],
    },
  };
  if (error && error.stack) event.extra = { stack: error.stack };
  if (extra) event.extra = { ...event.extra, ...extra };
  return event;
}

// Fire one error event at the configured DSN and report what the server said:
// `{ ok, status }` where `ok` is a 2xx and `status` is the HTTP status, or 0
// when no response was obtained (bad DSN, network failure, timeout). Never
// throws — Sentry is an observability mirror, not a dependency of the
// notification path. The status lets a caller tell "our client failed" apart
// from "the server is up but refusing" (5xx), which the live test needs.
export function sendSentryEnvelope(sentryConfig, { context, error, extra }) {
  return new Promise((resolve) => {
    const dsn = parseSentryDsn(sentryConfig?.dsn || '');
    if (!dsn) { resolve({ ok: false, status: 0 }); return; }

    const event = buildErrorEvent({ context, error, extra });
    const envelope =
      JSON.stringify({ event_id: event.event_id, sent_at: event.timestamp }) + '\n' +
      JSON.stringify({ type: 'event' }) + '\n' +
      JSON.stringify(event) + '\n';

    let parsed;
    try { parsed = new URL(dsn.envelopeUrl); } catch { resolve({ ok: false, status: 0 }); return; }
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(parsed, {
      method: 'POST',
      agent: false, // no keep-alive socket may outlive the hook's process.exit()
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=${pkg.name}/${pkg.version}, sentry_key=${dsn.publicKey}`,
      },
      timeout: SEND_TIMEOUT_MS,
    }, (res) => {
      res.resume(); // drain
      const status = res.statusCode || 0;
      res.on('end', () => resolve({ ok: status >= 200 && status < 300, status }));
    });

    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
    req.end(envelope);
  });
}

// Boolean convenience used by error-log.mjs: true on 2xx, false on anything else.
export function sendSentryErrorEvent(sentryConfig, payload) {
  return sendSentryEnvelope(sentryConfig, payload).then((r) => r.ok);
}
