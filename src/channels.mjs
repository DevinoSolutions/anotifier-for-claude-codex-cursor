// src/channels.mjs — which delivery channels are on, and the fan-out over them
// for notices that are not routed agent events (the usage and context warnings,
// the "update available" nag).
//
// The enable gates are the single definition of "this channel is on":
//   toast    on unless config.toast.enabled is false
//   ntfy     config.ntfy.enabled AND a topic
//   webhook  config.webhook.enabled AND a url
// The terminal bell is deliberately not a channel here: a statusline or a
// post-run nag has no terminal of its own to ring, and the run that triggered
// the update notice already rang for the real event.
//
// notify.mjs's per-event routing keeps its own gates (per-event overrides, the
// bell); only the predicates are meant to be shared with it.
import { sendNtfy } from './ntfy.mjs';
import { sendWebhook } from './webhook.mjs';
import { resolveToastBackend } from './platforms/index.mjs';

export const toastOn = (config) => config?.toast?.enabled !== false;
export const ntfyOn = (config) => Boolean(config?.ntfy?.enabled && config?.ntfy?.topic);
export const webhookOn = (config) => Boolean(config?.webhook?.enabled && config?.webhook?.url);

// Is any channel on? The one definition of "a channel": the senders below go
// through exactly these, and the statusline tap skips (and so does not record)
// a warning that nothing could deliver.
export const hasChannel = (config) => toastOn(config) || ntfyOn(config) || webhookOn(config);

// Send each of `notifications` through every channel that is on, all at once,
// and resolve with the Promise.allSettled results. allSettled, not all: the
// senders resolve false rather than reject, but the dynamic toast-backend import
// can reject on a broken install and must not propagate out of a best-effort
// path. Order per notification: toast, ntfy, webhook. Never rejects (apart from
// an injected sender that throws synchronously, which no real sender does).
//
// The senders are injectable for tests. Two hooks let a caller shape what one
// channel receives without changing which channels are on:
//   notificationFor(channel, notification) -> the notification that channel
//     gets ('toast' | 'ntfy' | 'webhook'); default: the same one for all
//   ntfyConfig -> used instead of config.ntfy for the ntfy send
export function sendToChannels(config, notifications, {
  resolveBackend = resolveToastBackend,
  ntfy = sendNtfy,
  webhook = sendWebhook,
  notificationFor = (channel, n) => n,
  ntfyConfig = config?.ntfy,
} = {}) {
  const tasks = [];
  for (const n of notifications) {
    if (toastOn(config)) {
      const toast = notificationFor('toast', n);
      tasks.push(resolveBackend().then((send) => send(toast)));
    }
    if (ntfyOn(config)) tasks.push(ntfy(ntfyConfig, notificationFor('ntfy', n)));
    if (webhookOn(config)) tasks.push(webhook(config.webhook, notificationFor('webhook', n)));
  }
  return Promise.allSettled(tasks);
}
