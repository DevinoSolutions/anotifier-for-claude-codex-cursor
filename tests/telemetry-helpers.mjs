// tests/telemetry-helpers.mjs — shared by the telemetry unit and e2e suites.
import os from 'node:os';

// Vocabulary that legitimately appears in every payload. A hostname or username
// that is merely a substring of this (a user called "node" vs the key
// "node_version") says nothing about a leak, so it is not used as a probe.
const BENIGN = [
  '$lib', '$lib_version', '$geoip_disable', 'anotifier', 'anotifier_version', 'os', 'os_release', 'arch',
  'node_version', 'api_key', 'distinct_id', 'properties', 'event', 'timestamp', 'batch', 'hook_daily_summary',
  'window_start', 'window_hours', 'config', 'counters', 'outcomes', 'sources', 'channels', 'latency',
  'unmapped_events', 'win32', 'darwin', 'linux', 'x64', 'arm64', os.release(), os.platform(), os.arch(),
  process.versions.node,
].join(' ').toLowerCase();

// The machine's hostname and username, when long enough to be meaningful
// probes (>= 4 chars) and not part of the fixed payload vocabulary.
export function identityProbes() {
  let username = '';
  try { username = os.userInfo().username; } catch { /* no passwd entry */ }
  return [os.hostname(), username].filter((v) => v.length >= 4 && !BENIGN.includes(v.toLowerCase()));
}
