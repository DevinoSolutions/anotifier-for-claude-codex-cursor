// scripts/live-claude.mjs — Tier 2 live E2E for Claude Code.
// HARD checks (any failure exits non-zero):
//   1. a model key must be present: PROXYAI_API_KEY (our own proxy, free open
//      models, preferred) or ANTHROPIC_API_KEY (real Anthropic, fallback).
//   2. claude runs our prompt with the patched config and returns output.
//   3. the Stop hook delivers a real ntfy push.
// A provider account error (no credits, quota, bad key) is FAIL [INFRA], not a
// product failure: the model never answered, whatever anotifier did.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { patchClaude } from '../setup/patch-config.mjs';
import { claudeProvider, apiAccountError } from './lib/provider.mjs';
import { setupIsolatedHomeWithToast, pollForPush, randomTopic, nonceMarker } from './lib/live-driver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTIFY = path.resolve(__dirname, '..', 'src', 'notify.mjs');

async function main() {
  // HARD: a key must be set. A missing key is a configuration failure, not a
  // reason to silently skip.
  const provider = claudeProvider();
  if (!provider) {
    console.error('FAIL [INFRA]: neither PROXYAI_API_KEY nor ANTHROPIC_API_KEY is set — live Claude E2E needs a model key.');
    process.exit(1);
  }
  console.log(`live-claude: model provider = ${provider.label}`);

  const topic = randomTopic('live-claude');
  const marker = nonceMarker('claude');
  const home = setupIsolatedHomeWithToast({ prefix: 'aan-live-claude-', dir: '.claude', topic, seedSettingsFile: 'settings.json' });
  patchClaude(path.join(home, '.claude'), NOTIFY);

  // Every assertion below is model-agnostic — any model can echo a token and fire
  // the Stop hook — so the provider picks the model: haiku on a real Anthropic key
  // (the cheapest that proves the wiring), a sonnet-tier open model on the proxy.
  // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC additionally mutes the auto-updater,
  // telemetry, error reporting, and the extra billed helper calls (e.g. haiku-powered
  // summarization) that are pure cost here.
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...provider.env,
  };
  // Open models can be slow to first byte or drop a stream, so the proxy path
  // gets a longer per-attempt timeout and a second attempt. A provider account
  // error is final: retrying cannot fix it.
  const attempts = provider.slow ? 2 : 1;
  const timeout = provider.slow ? 330000 : 120000;
  let res;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    res = spawnSync('claude', ['--model', provider.model, '-p', `Reply with exactly this token and nothing else: ${marker}`], {
      encoding: 'utf8', env, timeout,
    });
    console.log(`claude attempt ${attempt}/${attempts} exit:`, res.status);
    console.log('claude stdout:', (res.stdout || '').slice(0, 500));
    console.log('claude stderr:', (res.stderr || '').slice(0, 500));
    if (res.status === 0 && (res.stdout || '').trim()) break;
    if (apiAccountError(`${res.stdout}\n${res.stderr}`)) break;
  }

  // The provider refused the request for account reasons: nothing to learn about
  // anotifier. Still exit 1, because the Stop hook was not proven.
  const accountErr = apiAccountError(`${res.stdout}\n${res.stderr}`);
  if (accountErr) {
    console.error(`FAIL [INFRA]: the ${provider.label} provider refused the request: "${accountErr}"`);
    process.exit(1);
  }

  // HARD: the agent actually ran with our key + config.
  if (res.status !== 0 || !(res.stdout || '').trim()) {
    console.error(`FAIL [PRODUCT]: claude did not run successfully on ${provider.label}`);
    process.exit(1);
  }
  console.log(`PASS (hard): claude ran with our config + key (${provider.label})`);

  // HARD: the Stop hook must deliver an ntfy push. If the hook does not fire in
  // this mode, fix how we drive the agent — do not weaken this check.
  //
  // Body assertion is HARD but does NOT check `marker`: ntfy rich content is
  // default-OFF for privacy (src/transcript.mjs), so the ntfy body is the generic
  // router message for a claude Stop (task_complete) → "<project>: Task complete",
  // never the assistant's nonce. That generic body is deterministic, so gating on
  // it is safe; the assistant's rich text is proven on the toast lane, not here.
  await pollForPush({
    topic,
    // Title is "<project> · Claude Code" where <project> is the runner's cwd
    // basename (src/router.mjs) — anchor on the label, not the checkout name.
    match: (m) => /(^| · )Claude Code$/.test(m.title || ''),
    assertBody: (m) => typeof m.message === 'string' && m.message.endsWith('Task complete'),
    failMessage: 'FAIL: Stop hook did not deliver an ntfy push within the poll window',
    bodyFailMessage: 'FAIL: ntfy body was not the expected task_complete message ("…: Task complete")',
    passMessage: 'PASS (hard): Stop hook delivered an ntfy push',
  });

  // macOS only: prove the toast was actually DELIVERED (not just exit 0). The
  // claude toast body is rich content — the assistant's words — so it carries
  // our marker. Requires the runner's FDA grant (the workflow runs preflight).
  if (process.platform === 'darwin') {
    const { verifyDelivery } = await import('../src/platforms/macos-delivery.mjs');
    // SOFT (best-effort, non-fatal): reading a toast back after it is fired through claude's REAL
    // Stop hook depends on usernoted's ASYNC commit under a warm, loaded post-turn runner — which is
    // intermittent to observe here (green on 3e175c7, then missed within a full 45s window on both
    // 313d0f3 and bddb658, PR #6), unlike a quiet direct fire. The HARD osascript->NC positive-delivery
    // guarantee lives in the dedicated Toast macOS lane (toast-macos.yml), which is reliably green.
    // So we OBSERVE and log it here but do NOT fail this required check on it — a required check must
    // not hinge on an intermittently-observable async commit. This lane's HARD proof is: a real Claude
    // turn + the real Stop hook + a real ntfy push round-trip (all asserted above).
    const del = await verifyDelivery(marker, { timeoutMs: 45000, pollMs: 1000 });
    if (del.delivered) {
      console.log(`PASS (soft): NC delivery record present via the real agent hook — title="${del.record.title}"`);
    } else {
      console.warn(`WARN (soft, non-fatal): NC record for "${marker}" not observed within 45s (${del.reason}). The agent turn + Stop hook + ntfy push all passed; osascript->NC delivery is hard-proven in the Toast macOS lane.`);
    }
  }

  fs.rmSync(home, { recursive: true, force: true });
  process.exit(0);
}

main();
