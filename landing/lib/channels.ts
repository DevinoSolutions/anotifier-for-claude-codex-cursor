import type { Block } from "./docs";
import { COMMUNITY_URL } from "./site";

interface ChannelH1 {
  pre: string;
  em: string;
  post: string;
}

interface ChannelStep {
  /** Short mono label shown as a badge (e.g. "Slack", "config", "test"). */
  label: string;
  /** Inner HTML of the step description (simple inline tags: <b>, <code>). */
  text: string;
}

interface ChannelSection {
  id: string;
  kicker: string;
  title: string;
  blocks: Block[];
}

interface ChannelFaq {
  q: string;
  /** Inner HTML of the answer container (simple inline tags: <p>, <code>, <a>). */
  aHtml: string;
}

export interface Channel {
  slug: string;
  /** Last significant edit of this page's content (YYYY-MM-DD): the
      sitemap <lastmod>. Bump it when you change the entry, not on every build. */
  updated: string;
  /** Display name used in breadcrumb, headings, and cross-links (e.g. "Slack"). */
  name: string;
  /** Public path to the service's own logo file, shown beside the headline.
      Only third-party brands get one (sources: assets/icons/SOURCES.md). */
  icon?: string;
  /** Delivery mechanism — drives the shared privacy/safety section. */
  kind: "webhook" | "ntfy";
  title: string;
  description: string;
  h1: ChannelH1;
  sub: string;
  /** Lede paragraph under the "Set up" section. */
  setupIntro: string;
  /** Channel-side wiring steps, in order. */
  steps: ChannelStep[];
  /** Verbatim config JSON snippet, rendered in a <pre> block. */
  config: string;
  /** Extra sections after the config block: what the channel posts,
      troubleshooting. Same shape as an agent page's sections. */
  sections?: ChannelSection[];
  faqs: ChannelFaq[];
}

export const CHANNELS: Channel[] = [
  {
    slug: "slack",
    updated: "2026-10-15",
    name: "Slack",
    icon: "/assets/icons/slack.svg",
    kind: "webhook",
    title: "Slack Notifications for Claude Code & AI Agents — anotifier",
    description:
      "Send anotifier alerts to Slack when Claude Code, Codex, Cursor, or Gemini CLI finishes a task or needs input, via a Slack incoming webhook and one config.",
    h1: { pre: "", em: "Slack", post: " alerts when your agent finishes." },
    sub: "Your AI agent runs for minutes while you're already in Slack. anotifier posts to the channel of your choice the moment Claude Code, Codex, Cursor, or Gemini CLI finishes a task or stops to ask for input.",
    setupIntro:
      "anotifier talks to Slack through a standard Incoming Webhook — no bot, no OAuth app, no scopes to manage. Point it at a channel and you're done.",
    steps: [
      {
        label: "Slack",
        text: "In your Slack workspace, add an <b>Incoming Webhook</b> for the channel you want alerts in, then copy the webhook URL it gives you.",
      },
      {
        label: "config",
        text: "Run <code>npx anotifier@latest config webhook</code> and answer the prompts: enable the webhook, paste the URL, and enter <code>slack</code> as the format. Or add the block below to <code>~/.anotifier/config.json</code> yourself.",
      },
      {
        label: "test",
        text: "Fire a sample message with <code>anotifier test webhook</code> — it should land in the channel within a second.",
      },
    ],
    config: `{
  "webhook": {
    "enabled": true,
    "url": "https://hooks.slack.com/services/...",
    "format": "slack"
  }
}`,
    faqs: [
      {
        q: "How do I send Claude Code notifications to Slack?",
        aHtml:
          '<p>Create a Slack <b>Incoming Webhook</b> for a channel, paste its URL into <code>~/.anotifier/config.json</code> with <code>format: "slack"</code>, and anotifier posts there whenever an agent finishes or needs input. Run <code>anotifier test webhook</code> to confirm it works.</p>',
      },
      {
        q: "Is my Slack webhook URL kept private?",
        aHtml:
          "<p>Yes. The webhook URL is a secret, so anotifier never logs it in full — delivery failures record only the URL's origin, and errors go to <code>~/.anotifier/errors.log</code> without ever interrupting the agent.</p>",
      },
      {
        q: "Which agents can post to Slack?",
        aHtml:
          '<p>All of them. <a href="/claude-code/">Claude Code</a>, <a href="/codex/">Codex CLI</a>, <a href="/cursor/">Cursor</a>, <a href="/gemini-cli/">Gemini CLI</a>, and agents inside <a href="/vscode/">VS Code</a> share one config, so every finish and input request routes to the same Slack channel.</p>',
      },
      {
        q: "Will the Slack message show what the agent said?",
        aHtml:
          "<p>For Claude Code, the webhook carries the real text — the question for a needs-input event, or the last assistant message on task-complete. Other agents send a generic completion message.</p>",
      },
    ],
  },
  {
    slug: "discord",
    updated: "2026-10-15",
    name: "Discord",
    kind: "webhook",
    title: "Discord Notifications for Claude Code & AI Agents",
    description:
      "Post a Discord message the moment Claude Code, Codex, Cursor, or Gemini CLI finishes or needs input. Wire a Discord webhook to anotifier with one shared config.",
    h1: {
      pre: "",
      em: "Discord",
      post: " notifications for AI coding agents.",
    },
    sub: "Keep your agents' progress in the same place your team already hangs out. anotifier fires a Discord webhook when Claude Code, Codex, Cursor, or Gemini CLI wraps up or blocks on a question.",
    setupIntro:
      "Discord's built-in webhooks are all you need — no bot token, no gateway connection. Create one on a channel and hand anotifier the URL.",
    steps: [
      {
        label: "agents",
        text: "Run <code>npx anotifier@latest setup</code> once to wire your agents. It asks about phone push (ntfy) but not about webhooks, so Discord is added in the steps below.",
      },
      {
        label: "Discord",
        text: "Open <b>Server Settings → Integrations → Webhooks → New Webhook</b>, pick a channel, and copy the webhook URL. You need the Manage Webhooks permission on the server.",
      },
      {
        label: "config",
        text: "Run <code>npx anotifier@latest config webhook</code> and answer the prompts: enable the webhook, paste the URL, and enter <code>discord</code> as the format. Or add the block below to <code>~/.anotifier/config.json</code> yourself.",
      },
      {
        label: "test",
        text: "Run <code>npx anotifier@latest test webhook</code>. It posts <b>anotifier</b> and <i>Test notification — if you see this, it works!</i> to the channel.",
      },
    ],
    config: `{
  "webhook": {
    "enabled": true,
    "url": "https://discord.com/api/webhooks/...",
    "format": "discord"
  }
}`,
    sections: [
      {
        id: "message",
        kicker: "[ WHAT IT POSTS ]",
        title: "A bold title line, then the message.",
        blocks: [
          {
            kind: "p",
            text: "Each alert is one POST to the webhook with a JSON body that has a single field, `content`. The title comes first in bold, and the message follows on the next line:",
          },
          {
            kind: "code",
            lang: "json",
            code: `{
  "content": "**my-app · Claude Code**\\nmy-app: Task complete"
}`,
          },
          {
            kind: "p",
            text: "anotifier sets no embeds, mentions, username or avatar, so Discord shows the post under the name and picture you gave the webhook. `my-app` is the name of the folder the agent was started in. What the message says depends on the agent:",
          },
          {
            kind: "table",
            head: ["Alert", "Title", "Message"],
            rows: [
              [
                "Claude Code finished a turn",
                "`my-app · Claude Code`",
                "The start of Claude's last reply, up to 180 characters. If no reply text can be read, `my-app: Task complete`.",
              ],
              [
                "Claude Code needs you",
                "`my-app · Claude Code`",
                "Claude's own notification text, such as a permission request or a question, up to 180 characters. Without text, a line such as `my-app: Needs your input`.",
              ],
              [
                "Codex CLI finished or wants approval",
                "`my-app · Codex`",
                "`my-app: Task complete` or `my-app: Needs your input`. The command awaiting approval is not included.",
              ],
              [
                "Gemini CLI or Antigravity CLI",
                "`my-app · Gemini` or `my-app · Antigravity`",
                "`my-app: Task complete`, and for Gemini CLI `my-app: Needs your input`.",
              ],
              [
                "Cursor finished",
                "`Cursor`",
                "`Task complete`. anotifier doesn't read a project folder from Cursor's event, so there is no project name.",
              ],
              [
                "Usage-limit and context warnings, update notice",
                "Set by the warning",
                "Posted to the webhook as well when it is enabled.",
              ],
            ],
          },
          {
            kind: "p",
            text: "A new agent session no longer posts `Session started` from 1.7.1 on; earlier versions did, and you can turn it back on with `events.session_start.webhookEnabled`.",
          },
          {
            kind: "ul",
            items: [
              "**Claude's words are on by default.** `webhook.richContent` defaults to `true`, which is why the post carries what Claude said. Set it to `false` and every post is the generic line. Only Claude Code has reply text to send; the other agents are always generic.",
            ],
          },
        ],
      },
      {
        id: "quiet",
        kicker: "[ KEEP IT QUIET ]",
        title: "Mute one event, or everything for a while.",
        blocks: [
          {
            kind: "ul",
            items: [
              '**One event off.** `"events": { "task_complete": { "webhookEnabled": false } }` keeps input requests and mutes completion posts. The `anotifier config` prompts have no per-event webhook setting, so edit `config.json` for this.',
              "**Snooze.** `npx anotifier@latest snooze 2h` silences every channel, the webhook included. `snooze off` ends it early.",
              '**Quiet hours.** `"quietHours": { "enabled": true, "from": "22:00", "to": "08:00" }` does the same every day on a schedule.',
            ],
          },
        ],
      },
      {
        id: "troubleshooting",
        kicker: "[ IF NOTHING ARRIVES ]",
        title: "What each failure means, and the fix.",
        blocks: [
          {
            kind: "p",
            text: "A webhook failure never reaches the agent. It is appended to `~/.anotifier/errors.log` with the URL's origin only, and `npx anotifier@latest status` prints the latest ones. Start with `npx anotifier@latest test webhook`: it exits with an error if Discord doesn't answer with a 2xx status.",
          },
          {
            kind: "table",
            head: ["What you see", "Cause", "Fix"],
            rows: [
              [
                "`test` prints `webhook not configured`",
                "`webhook.enabled` is off or `url` is empty.",
                "Run `npx anotifier@latest config webhook`.",
              ],
              [
                "`webhook url is not a valid URL` in the log, or `webhook enabled but URL invalid` from `doctor`",
                "The URL was pasted with a typo, a missing `https://` or stray quotes.",
                "Copy the URL from Discord again.",
              ],
              [
                "`webhook endpoint responded 404` or `401`",
                "Discord no longer accepts that URL: the webhook was deleted or its token changed.",
                "Create a new webhook in Server Settings and update `webhook.url`.",
              ],
              [
                "`webhook endpoint responded 429`",
                "Discord is rate-limiting the webhook. anotifier doesn't retry, so that post is lost.",
                "Mute an event or snooze to cut the volume. The next alert posts normally.",
              ],
              [
                "`webhook request timed out after 5000ms`",
                "Discord didn't answer within 5 seconds: a network, proxy or captive-portal problem.",
                "Check that this machine can reach discord.com. The next alert tries again.",
              ],
              [
                "`test` works but agent alerts don't arrive",
                "A snooze or quiet-hours window is active, the event has `webhookEnabled: false`, or the agent isn't wired.",
                "`status` shows Snooze, Quiet hours and which tools are wired.",
              ],
              [
                "Claude Code finished but nothing posted",
                "Its Stop hook fired while background subagents or shells were still running, so anotifier waited.",
                "Nothing is wrong. The post arrives when the background work ends.",
              ],
            ],
          },
          {
            kind: "p",
            text: `Still stuck? Ask in the [anotifier Discord](${COMMUNITY_URL}).`,
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I get a Discord notification when Claude Code finishes?",
        aHtml:
          '<p>Create a Discord webhook under <b>Server Settings → Integrations → Webhooks</b>, then run <code>npx anotifier@latest config webhook</code> and enter its URL with the format <code>discord</code>. You can also set <code>webhook.url</code> and <code>format: "discord"</code> in <code>~/.anotifier/config.json</code> yourself. anotifier posts to that channel every time an agent finishes or needs you.</p>',
      },
      {
        q: "Does anotifier expose my Discord webhook URL?",
        aHtml:
          "<p>No. The webhook URL is treated as a secret and never logged in full — only its origin is recorded on failure, and errors are written to <code>~/.anotifier/errors.log</code> without touching the running agent.</p>",
      },
      {
        q: "Can every AI agent post to the same Discord channel?",
        aHtml:
          '<p>Yes. One config covers <a href="/claude-code/">Claude Code</a>, <a href="/codex/">Codex CLI</a>, <a href="/cursor/">Cursor</a>, <a href="/gemini-cli/">Gemini CLI</a>, and <a href="/vscode/">VS Code</a> agents, so they all report to the same Discord webhook.</p>',
      },
      {
        q: "How do I turn Discord alerts off for one event?",
        aHtml:
          '<p>Add an <code>events</code> override to your config — for example <code>{ "events": { "task_complete": { "webhookEnabled": false } } }</code> — to keep input requests but mute completion posts.</p>',
      },
      {
        q: "Does Discord see my code or conversation?",
        aHtml:
          "<p>Only the notification text. For Claude Code that is the first 180 characters of its last reply, because <code>webhook.richContent</code> defaults to <code>true</code>. Set it to <code>false</code> and Discord only receives lines like <code>my-app: Task complete</code>. Other agents are always generic.</p>",
      },
      {
        q: "Does anotifier retry if Discord is down or rate-limits the webhook?",
        aHtml:
          "<p>No. Each alert is one request with a 5-second timeout. An error status, a timeout or a network failure is logged to <code>~/.anotifier/errors.log</code> and that post is dropped. Nothing is queued, and the next alert tries again.</p>",
      },
      {
        q: "Can I post to more than one Discord channel?",
        aHtml:
          "<p>Not with one config. The <code>webhook</code> block holds a single URL, and every agent posts to it. Snooze, quiet hours and the per-event switches decide what reaches that channel.</p>",
      },
    ],
  },
  {
    slug: "telegram",
    updated: "2026-09-25",
    name: "Telegram",
    icon: "/assets/icons/telegram.svg",
    kind: "webhook",
    title: "Telegram Alerts for Claude Code & AI Coding Agents",
    description:
      "Get a Telegram message when Claude Code or any AI coding agent finishes a task or needs input. A @BotFather bot plus anotifier's config, no polling.",
    h1: {
      pre: "",
      em: "Telegram",
      post: " alerts for Claude Code & friends.",
    },
    sub: "Telegram is already on your phone and desktop. anotifier has a @BotFather bot message you directly the moment Claude Code, Codex, Cursor, or Gemini CLI finishes or stops for input.",
    setupIntro:
      "There's no server to run — anotifier just POSTs to Telegram's <code>sendMessage</code> endpoint, and your bot delivers the alert straight to your chat.",
    steps: [
      {
        label: "@BotFather",
        text: "Message <b>@BotFather</b> in Telegram to create a bot and grab its token, then send your bot a message so it's allowed to reply to you.",
      },
      {
        label: "chat id",
        text: "Find your numeric chat id and note it — the bot DMs you directly at that id.",
      },
      {
        label: "config",
        text: "Add the block below to <code>~/.anotifier/config.json</code> with <code>format</code> <code>telegram</code>, your bot token in the URL, and your <code>chatId</code>.",
      },
      {
        label: "test",
        text: "Run <code>anotifier test webhook</code> to send yourself a sample message.",
      },
    ],
    config: `{
  "webhook": {
    "enabled": true,
    "url": "https://api.telegram.org/bot<token>/sendMessage",
    "format": "telegram",
    "chatId": "123456789"
  }
}`,
    faqs: [
      {
        q: "How do I set up Telegram alerts for Claude Code?",
        aHtml:
          '<p>Create a bot with <b>@BotFather</b> to get a token, find your chat id, then add both to <code>~/.anotifier/config.json</code> with <code>format: "telegram"</code>. anotifier messages you whenever an agent finishes or needs input.</p>',
      },
      {
        q: "Do I need to host a Telegram bot server?",
        aHtml:
          "<p>No. There's nothing to run — anotifier simply POSTs to Telegram's <code>sendMessage</code> URL, and the bot delivers the message to your chat. No polling, no webhook receiver.</p>",
      },
      {
        q: "Is my bot token safe?",
        aHtml:
          "<p>Your bot token lives inside the request URL, which anotifier treats as a secret — it's never logged in full, only the origin is recorded on failure, and errors land in <code>~/.anotifier/errors.log</code>.</p>",
      },
      {
        q: "Which agents can send to Telegram?",
        aHtml:
          '<p>Every supported agent shares the same config — <a href="/claude-code/">Claude Code</a>, <a href="/codex/">Codex CLI</a>, <a href="/cursor/">Cursor</a>, <a href="/gemini-cli/">Gemini CLI</a>, and <a href="/vscode/">VS Code</a> agents all message the same Telegram chat.</p>',
      },
    ],
  },
  {
    slug: "phone",
    updated: "2026-09-11",
    name: "Phone push",
    kind: "ntfy",
    title: "Phone Push for Claude Code & AI Coding Agents — anotifier",
    description:
      "Get a push notification on your iPhone or Android when Claude Code, Codex, Cursor, or Gemini CLI finishes — free phone alerts over ntfy, no account needed.",
    h1: { pre: "", em: "Phone push", post: " when your agent finishes." },
    sub: "Walk away from the desk and still know the moment your agent is done. anotifier pushes to your iPhone or Android over ntfy when Claude Code, Codex, Cursor, or Gemini CLI finishes or needs input.",
    setupIntro:
      'Phone push runs on <a href="https://ntfy.sh">ntfy</a> — free, open source, and account-free. Install the app, subscribe to one topic, and every tool\'s alerts arrive in a single stream.',
    steps: [
      {
        label: "install",
        text: "Install the <b>ntfy</b> app — Android from Google Play (<code>io.heckel.ntfy</code>), iOS from the App Store.",
      },
      {
        label: "setup",
        text: "Run <code>npx anotifier@latest setup</code> and let it configure phone push, or add the <code>ntfy</code> block below to <code>~/.anotifier/config.json</code>.",
      },
      {
        label: "subscribe",
        text: "In the app, subscribe to the topic shown during setup (something like <code>anotifier-&lt;random&gt;</code>). Every tool's alerts land in that one stream.",
      },
      {
        label: "test",
        text: "Run <code>anotifier test ntfy</code> — your phone should buzz right away.",
      },
    ],
    config: `{
  "ntfy": {
    "enabled": true,
    "server": "https://ntfy.sh",
    "topic": "anotifier-<random>"
  }
}`,
    faqs: [
      {
        q: "How do I get notified on my phone when Claude Code finishes?",
        aHtml:
          '<p>Install the <a href="https://ntfy.sh">ntfy</a> app, run <code>anotifier setup</code> to configure phone push, and subscribe to the topic it shows you. Your phone buzzes the moment Claude Code — or any supported agent — finishes or needs input.</p>',
      },
      {
        q: "Does it work on both iPhone and Android?",
        aHtml:
          "<p>Yes. The ntfy app is on the App Store and Google Play, and anotifier pushes to both the same way — one topic, notifications on every device you subscribe.</p>",
      },
      {
        q: "Can people see my notifications on the public ntfy server?",
        aHtml:
          '<p>By default no content leaks. <code>ntfy.richContent</code> is off, so on the public ntfy.sh server your phone only sees generic text like "task complete", never conversation content. Turn on rich push only on a private ntfy server you control.</p>',
      },
      {
        q: "Do I need an account or a paid plan?",
        aHtml:
          '<p>No. ntfy is free and needs no account — anotifier uses the public <a href="https://ntfy.sh">ntfy.sh</a> server by default, and you can point it at your own server any time.</p>',
      },
    ],
  },
];

export function getChannel(slug: string): Channel | undefined {
  return CHANNELS.find((c) => c.slug === slug);
}
