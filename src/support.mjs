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

// One sentence, reused verbatim by setup and status so the ask reads the same
// everywhere and stays easy to grep for.
export const SUPPORT_LINE = `♥ anotifier is free & open source. If it saves you time, consider supporting it: ${SUPPORT_URL}`;
