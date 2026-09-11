interface AgentHook {
  event: string;
  what: string;
  how: string;
}

interface AgentFaq {
  q: string;
  /** Inner HTML of the answer container (simple inline tags: <p>, <code>, <a>). */
  aHtml: string;
}

interface AgentH1 {
  pre: string;
  em: string;
  post: string;
}

export interface Agent {
  slug: string;
  /** Display name used in breadcrumb, headings, and cross-links (e.g. "Claude Code"). */
  name: string;
  title: string;
  description: string;
  h1: AgentH1;
  sub: string;
  /** Lede paragraph under the "How it hooks in" section. */
  hooksIntro: string;
  hooks: AgentHook[];
  /** Extra install line, rendered as HTML below the install command (claude-code only). */
  extraInstall?: string;
  faqs: AgentFaq[];
  /** Public path to the agent icon. */
  icon: string;
}

export const AGENTS: Agent[] = [
  {
    slug: "claude-code",
    name: "Claude Code",
    title:
      "Claude Code Notifications — Desktop & Phone Alerts When Claude Finishes",
    description:
      "Get a desktop toast, phone push, or webhook the moment Claude Code finishes a task or needs your input. One-command setup with anotifier — works in the terminal and inside VS Code.",
    h1: { pre: "Notifications for ", em: "Claude Code", post: "." },
    sub: "Claude Code runs for minutes at a time — refactoring, running tests, waiting on a permission prompt you haven't seen. anotifier hooks into Claude Code's native event system and pings you the moment it finishes or needs you.",
    hooksIntro:
      "anotifier wires itself into Claude Code's built-in hook system during setup. No extension, no wrapper process — Claude Code itself fires the events.",
    hooks: [
      {
        event: "Stop",
        what: "Claude Code finished its turn",
        how: "“Task complete — refactored auth module, 14 tests passing” with the real transcript summary.",
      },
      {
        event: "Notification",
        what: "Claude Code needs your input",
        how: "Permission prompts and questions surface as urgent alerts, so approvals never sit unnoticed.",
      },
    ],
    extraInstall:
      "Or install it as a Claude Code plugin, in two steps: <code>/plugin marketplace add DevinoSolutions/anotifier-for-claude-codex-cursor</code> then <code>/plugin install anotifier@anotifier</code>",
    faqs: [
      {
        q: "How does anotifier integrate with Claude Code?",
        aHtml:
          "<p>It uses Claude Code's native hooks. <code>anotifier setup</code> detects Claude Code and registers <code>Stop</code> and <code>Notification</code> hooks in your Claude settings. When Claude Code finishes a turn or asks for input, the hook fires and anotifier routes it to your channels.</p>",
      },
      {
        q: "Does it work with Claude Code inside VS Code?",
        aHtml:
          "<p>Yes. The hooks fire whether Claude Code runs in a terminal or in the VS Code extension, and click-to-focus jumps you back to the right window.</p>",
      },
      {
        q: "Can I get Claude Code alerts on my phone?",
        aHtml:
          '<p>Yes — phone push works over <a href="https://ntfy.sh">ntfy</a> on Android and iOS with no account. Your phone buzzes when Claude finishes, even if you\'ve walked away from the desk.</p>',
      },
      {
        q: "Is my code or conversation sent anywhere?",
        aHtml:
          "<p>No. anotifier runs locally with zero runtime dependencies. Only the notification text (e.g. the task summary) goes to the channels you explicitly configure.</p>",
      },
    ],
    icon: "/assets/icons/claude.png",
  },
  {
    slug: "codex",
    name: "Codex CLI",
    title:
      "Codex CLI Notifications — Know When Codex Finishes or Needs Approval",
    description:
      "Desktop toasts, phone push, and webhooks for OpenAI Codex CLI. anotifier pings you when Codex finishes a task or requests permission — one command to set up.",
    h1: { pre: "Notifications for ", em: "Codex CLI", post: "." },
    sub: "Codex works quietly in your terminal until it's done — or until it's stuck waiting for you to approve a command. anotifier turns both moments into notifications on your desktop, phone, or team chat.",
    hooksIntro:
      "Setup registers anotifier with Codex CLI's own hook system, so Codex reports its own state changes the instant they happen.",
    hooks: [
      {
        event: "Stop",
        what: "Codex finished the task",
        how: "A toast with the completion summary the moment the run ends.",
      },
      {
        event: "PermissionRequest",
        what: "Codex wants to run a command",
        how: "“Needs your input — allow npm test?” flagged urgent so approvals don't stall the run.",
      },
    ],
    faqs: [
      {
        q: "How does anotifier know when Codex CLI is done?",
        aHtml:
          "<p>Codex CLI has its own hook system for lifecycle events. <code>anotifier setup</code> detects Codex, writes the hooks into <code>~/.codex/hooks.json</code>, and enables the hooks feature in <code>~/.codex/config.toml</code> — so completion and permission events go straight to your notification channels.</p>",
      },
      {
        q: "Can I approve Codex permission requests faster?",
        aHtml:
          "<p>Permission requests arrive as urgent notifications with the requested command in the body, and click-to-focus takes you straight back to the Codex terminal to approve it.</p>",
      },
      {
        q: "Does it change how Codex runs?",
        aHtml:
          "<p>No. anotifier only listens for events Codex already emits — it never wraps, slows, or intercepts the agent itself.</p>",
      },
    ],
    icon: "/assets/icons/codex.png",
  },
  {
    slug: "cursor",
    name: "Cursor",
    title: "Cursor Notifications — Get Pinged When Your Cursor Agent Finishes",
    description:
      "Stop watching Cursor work. anotifier sends a desktop toast, phone push, or webhook when your Cursor agent finishes editing — one command setup, no extension required.",
    h1: { pre: "Notifications for ", em: "Cursor", post: "." },
    sub: "You kick off a Cursor agent, switch to something else, and check back… too late or too often. anotifier watches Cursor's agent lifecycle and tells you the moment the edits are ready to review.",
    hooksIntro:
      "Setup detects Cursor and hooks its agent lifecycle, so the notification fires exactly when the agent stops — not when you happen to look.",
    hooks: [
      {
        event: "stop",
        what: "The Cursor agent finished",
        how: "“Agent finished — review 3 edits in src/auth” the second the run completes.",
      },
    ],
    faqs: [
      {
        q: "Does this need a Cursor extension?",
        aHtml:
          "<p>No. anotifier hooks Cursor's own agent hook system from the outside — <code>anotifier setup</code> detects Cursor and wires it up automatically.</p>",
      },
      {
        q: "What does a Cursor notification look like?",
        aHtml:
          "<p>A desktop toast (or phone push / webhook) with the agent's completion summary, e.g. which files were edited — and clicking it focuses the right Cursor window.</p>",
      },
      {
        q: "Can I use it alongside Claude Code and Codex?",
        aHtml:
          "<p>Yes — that's the point. One config covers every agent anotifier supports, so all your tools notify through the same channels.</p>",
      },
    ],
    icon: "/assets/icons/cursor.png",
  },
  {
    slug: "gemini-cli",
    name: "Gemini CLI",
    title: "Gemini CLI Notifications — Alerts When Your Gemini Agent Finishes",
    description:
      "Desktop, phone, and webhook notifications for Google Gemini CLI. anotifier hooks Gemini CLI's agent events and pings you when a run finishes or needs input.",
    h1: { pre: "Notifications for ", em: "Gemini CLI", post: "." },
    sub: "Gemini CLI chews through long agentic runs in your terminal. anotifier hooks its agent events so the finish line — or a question that blocks it — reaches you wherever you are.",
    hooksIntro:
      "Setup registers hooks for Gemini CLI's agent lifecycle events, so notifications come from Gemini itself, not from polling.",
    hooks: [
      {
        event: "AfterAgent",
        what: "The Gemini agent run completed",
        how: "A completion toast with the run summary when the agent loop ends.",
      },
      {
        event: "Notification",
        what: "Gemini CLI needs attention",
        how: "Input requests and warnings become alerts instead of silent terminal lines.",
      },
    ],
    faqs: [
      {
        q: "How does the Gemini CLI integration work?",
        aHtml:
          "<p>Gemini CLI supports lifecycle hooks; <code>anotifier setup</code> detects it and registers for its agent-completion and notification events, then routes them to your channels.</p>",
      },
      {
        q: "Which platforms can receive the alerts?",
        aHtml:
          '<p>macOS, Windows, and Linux/WSL desktop toasts, Android and iOS push via <a href="https://ntfy.sh">ntfy</a>, plus webhooks for Slack, Discord, Telegram, or any HTTP endpoint.</p>',
      },
      {
        q: "Is anything from my session uploaded?",
        aHtml:
          "<p>No — anotifier is a local, zero-dependency tool. Only the notification text goes to channels you configure yourself.</p>",
      },
    ],
    icon: "/assets/icons/gemini.png",
  },
  {
    slug: "vscode",
    name: "VS Code",
    title: "AI Agent Notifications in VS Code — Claude Code & Cursor Alerts",
    description:
      "Running Claude Code or an AI agent inside VS Code? anotifier pings you when it finishes or needs input, and click-to-focus jumps you back to the right window.",
    h1: { pre: "Agent notifications, in ", em: "VS Code", post: "." },
    sub: "Agents running inside your editor are the easiest to forget — the terminal panel is hidden and the agent works in silence. anotifier surfaces every finish and every question as a real notification, then puts you back in the right VS Code window with one click.",
    hooksIntro:
      "anotifier's hooks fire no matter where the agent runs — a standalone terminal, the VS Code integrated terminal, or an editor-native agent panel.",
    hooks: [
      {
        event: "Claude Code in VS Code",
        what: "Stop & Notification hooks",
        how: "Works identically in the VS Code extension and the integrated terminal.",
      },
      {
        event: "Cursor",
        what: "Agent stop hook",
        how: "Cursor is a VS Code fork — click-to-focus targets the exact window that owns the agent.",
      },
    ],
    faqs: [
      {
        q: "Do I need to install a VS Code extension?",
        aHtml:
          "<p>No. anotifier hooks the agents themselves, so it works regardless of which editor hosts them — nothing is added to VS Code.</p>",
      },
      {
        q: "What is click-to-focus?",
        aHtml:
          "<p>Clicking a notification brings the exact VS Code (or Cursor) window that fired it to the front — no hunting through windows to find the right session.</p>",
      },
      {
        q: "Which agents does it cover inside VS Code?",
        aHtml:
          "<p>Claude Code (extension or integrated terminal) and Cursor's agent, plus any supported CLI agent you run in the integrated terminal — Codex CLI and Gemini CLI included.</p>",
      },
    ],
    icon: "/assets/icons/vscode.png",
  },
];

export function getAgent(slug: string): Agent | undefined {
  return AGENTS.find((a) => a.slug === slug);
}
