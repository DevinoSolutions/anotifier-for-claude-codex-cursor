// cli/update-banner.mjs — the one "Update available" banner the CLI prints.
// cli/index.mjs prints it after a command's output; `status` prints it itself,
// above its support line, and says so by exporting printsOwnUpdateBanner.
import { createRequire } from 'node:module';
import { isNewer } from '../src/update-check.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// `c` is the ui.mjs colour helper; `updatePromise` is checkForUpdate()'s
// memoized result, so no caller makes a second request. Prints nothing unless a
// strictly newer version is known. The semver gate is re-asserted here instead
// of trusting the cached hit: the shared .update-check.json can hold a version
// recorded BEFORE the user upgraded, and for the rest of the 24h TTL that would
// render as "v1.3.0 → v1.3.0". Same guard maybeNotifyUpdate applies on the hook
// path. A caller that supplies its own spacing turns the blank lines off.
export async function printUpdateBanner(c, updatePromise, { leadingBlank = false, trailingBlank = true } = {}) {
  const latest = await updatePromise;
  if (!latest || !isNewer(latest, pkg.version)) return;
  if (leadingBlank) console.log();
  console.log(`  ${c.warn('↑')} ${c.warn(`Update available: v${pkg.version} → v${latest}`)}`);
  console.log(`    ${c.muted('npm i -g anotifier@latest')}${trailingBlank ? '\n' : ''}`);
}
