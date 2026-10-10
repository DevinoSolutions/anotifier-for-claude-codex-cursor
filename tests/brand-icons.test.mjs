// tests/brand-icons.test.mjs — third-party logos are the vendors' own files.
//
// The toast icons (assets/icons/, shipped in the npm package) and the site's
// copies (landing/public/assets/icons/) name real products, so each one must be
// the vendor's artwork with its source in assets/icons/SOURCES.md. These checks
// catch an icon being swapped back to an unsourced placeholder or an SVG being
// redrawn instead of copied from the vendor file.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// For text files: line endings are normalised so a CRLF checkout (Windows CI)
// hashes the same as the vendor's LF file.
const textSha256 = (buf) => sha256(Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(rel) {
  const buf = read(rel);
  assert.equal(buf.toString('latin1', 1, 4), 'PNG', `${rel} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const sources = read('assets/icons/SOURCES.md').toString('utf8');

describe('brand icons', () => {
  it('every toast icon has a source line in SOURCES.md', () => {
    const icons = fs.readdirSync(path.join(repoRoot, 'assets/icons')).filter((f) => f.endsWith('.png'));
    assert.ok(icons.length >= 5, `only ${icons.length} icons in assets/icons`);
    for (const f of icons) {
      assert.ok(sources.includes(`\`${f}\``), `${f} has no row in assets/icons/SOURCES.md`);
    }
  });

  it('Cursor is the brand-kit app icon, not the old unsourced cube', () => {
    // sha256 of the cursor.png files before 2026-10-10 (no recorded source).
    const placeholders = new Set([
      '1a42154399a081e3a9ca8d2a8327a7d3fcbba3ba0978799dd83fef39e9d36738',
      'ce22d2e9b891338cfff0c031ab90d705bc36a8bd78e33ce8b948fa62a305dc88',
    ]);
    for (const [rel, size] of [
      ['assets/icons/cursor.png', 512],
      ['landing/public/assets/icons/cursor.png', 128],
    ]) {
      assert.deepEqual(pngSize(rel), [size, size], rel);
      assert.ok(!placeholders.has(sha256(read(rel))), `${rel} is the old placeholder cube`);
    }
    assert.match(sources, /APP_ICON_3D_DARK\.png/);
    assert.match(sources, /cursor\.com\/brand/);
  });

  it('the Slack and Telegram marks are the vendor files, unmodified', () => {
    const vendor = {
      // https://a.slack-edge.com/9cc0056/marketing/img/nav/logo.svg
      'landing/public/assets/icons/slack.svg': '1f40066b694020057218c46eb2a11982b278d89b2dc8f96a21e4ea04e2b9db3b',
      // https://telegram.org/img/t_logo.svg
      'landing/public/assets/icons/telegram.svg': '85059d5e5bf7bda91ebab30664993c49867a26be6b947834aca16c846581766a',
    };
    for (const [rel, hash] of Object.entries(vendor)) {
      assert.equal(textSha256(read(rel)), hash,`${rel} differs from the vendor's file`);
      assert.ok(sources.includes(rel), `${rel} has no row in assets/icons/SOURCES.md`);
    }
  });

  it('each channel page icon exists and is sourced', () => {
    const channels = read('landing/lib/channels.ts').toString('utf8');
    const icons = [...channels.matchAll(/icon: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(icons.sort(), ['/assets/icons/slack.svg', '/assets/icons/telegram.svg']);
    for (const icon of icons) {
      assert.ok(fs.existsSync(path.join(repoRoot, 'landing/public', icon)), `${icon} is missing`);
    }
    const page = read('landing/components/ChannelPage.tsx').toString('utf8');
    assert.match(page, /<img src=\{channel\.icon\} alt="" /, 'the headline names the brand, so the logo is decorative');
  });

  it('the GitHub mark is the simple-icons 16.34.0 path, used in both footers', () => {
    const icon = read('landing/components/GitHubIcon.tsx').toString('utf8');
    const d = /<path d="([^"]+)"/.exec(icon)?.[1];
    assert.ok(d, 'GitHubIcon has no path');
    // sha256 of the `d` attribute of simple-icons@16.34.0/icons/github.svg
    assert.equal(
      crypto.createHash('sha256').update(d).digest('hex'),
      'd82e21f6c9bfbfd889fed4b8d8604121be1d364ef75b7fe42cc9c0b8737ae529',
    );
    assert.match(icon, /aria-hidden="true"/);
    for (const rel of ['landing/components/home/Footer.tsx', 'landing/components/SiteFooter.tsx']) {
      assert.match(read(rel).toString('utf8'), /<GitHubIcon size=\{14\} \/>/, `${rel} lost the GitHub mark`);
    }
  });
});
