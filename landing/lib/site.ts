/** Site-wide constants. One place to bump the version or swap the support URL. */
export const SITE_URL = "https://anotifier.io";
/** owner/name. The star button reads its live count from the GitHub API. */
export const GITHUB_REPO = "DevinoSolutions/anotifier-for-claude-codex-cursor";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const NPM_URL = "https://www.npmjs.com/package/anotifier";
export const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=QVVOIIud4-I";
/** Devino-wide sponsor profile — the same link the CLI and README point at. */
export const SUPPORT_URL = "https://github.com/sponsors/DevinoSolutions";
/** The anotifier Discord: where to ask for help. Permanent, unlimited invite;
    the CLI's src/support.mjs repeats it (tests/community.test.mjs pins both). */
export const COMMUNITY_URL = "https://discord.gg/CWDxfEJGcS";
/** Latest published npm version. Bump with every release. */
export const VERSION = "1.4.0";
/** ISO date of the newest content edit anywhere on the site (llms-full.txt). */
export const CONTENT_UPDATED = "2026-10-08";
/** Last significant content edit of each one-off page (YYYY-MM-DD): its
    sitemap <lastmod> and dateModified. Guide, agent and channel pages carry
    their own `updated` field. Bump only the page you changed — one shared date
    on every URL tells Google the lastmod values mean nothing. */
export const PAGE_UPDATED = {
  home: "2026-09-26",
  docs: "2026-09-27",
  compare: "2026-09-25",
} as const;
export const INSTALL_CMD = "npx anotifier@latest setup";
