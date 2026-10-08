// src/support.mjs — the ONE place the project's outbound "where to go" URLs live.
//
// SUPPORT_URL is read from package.json `funding.url` (the npm-standard field
// that `npm fund` also surfaces), so changing the sponsorship destination is a
// single package.json edit — the CLI, README badge and FUNDING.yml all follow.
// These are only ever printed by interactive CLI commands, never on the hook
// path and never inside a notification.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export const SUPPORT_URL = pkg.funding?.url ?? 'https://github.com/sponsors/DevinoSolutions';
export const DOCS_URL = 'https://anotifier.io/docs/';

// The anotifier Discord: where to ask for help. A permanent, unlimited invite;
// landing/lib/site.ts repeats it for the website (tests/community.test.mjs pins
// the two together).
export const COMMUNITY_URL = 'https://discord.gg/CWDxfEJGcS';

// The repo page, derived from package.json `repository.url`
// ("git+https://github.com/o/r.git" → "https://github.com/o/r").
export const STAR_URL = String(pkg.repository?.url ?? 'https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');

// One sentence, reused verbatim by setup and status so the ask reads the same
// everywhere and stays easy to grep for.
export const SUPPORT_LINE = `♥ anotifier is free & open source. If it saves you time, consider supporting it: ${SUPPORT_URL}`;

// The zero-cost ask, printed once at the end of a successful `setup` only —
// setup is the one moment a user has just chosen the tool.
export const STAR_LINE = `★ A GitHub star helps other developers find anotifier: ${STAR_URL}`;
