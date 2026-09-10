import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNtfyRequest, encodeHeaderValue } from '../src/ntfy.mjs';

// The router's "<project> · <label>" title carries U+00B7, and a project dir can
// be anything the filesystem allows. HTTP headers are latin-1 bytes in node, so
// non-ASCII must go out RFC 2047-encoded (ntfy decodes it) or the request either
// shows mojibake or throws ERR_INVALID_CHAR before it is ever sent.
describe('encodeHeaderValue (RFC 2047 for non-ASCII ntfy headers)', () => {
  it('passes pure-ASCII titles through verbatim', () => {
    assert.equal(encodeHeaderValue('Claude Code'), 'Claude Code');
    assert.equal(encodeHeaderValue('my-app: Task complete'), 'my-app: Task complete');
    assert.equal(encodeHeaderValue(''), '');
  });

  it('encodes the middle-dot separator title', () => {
    const encoded = encodeHeaderValue('my-app · Claude Code');
    assert.equal(encoded, `=?UTF-8?B?${Buffer.from('my-app · Claude Code', 'utf8').toString('base64')}?=`);
    assert.match(encoded, /^[\x20-\x7e]+$/, 'encoded form is pure ASCII');
  });

  it('encodes a non-ASCII project name (would otherwise throw ERR_INVALID_CHAR)', () => {
    const encoded = encodeHeaderValue('日本語 · Codex');
    assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    assert.equal(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8'), '日本語 · Codex');
  });

  it('buildNtfyRequest applies it to the Title header only', () => {
    const req = buildNtfyRequest({ topic: 't' }, {
      title: 'my-app · Claude Code', message: 'my-app: Task complete', priority: 'default', ntfyTags: 'x',
    });
    assert.match(req.headers.Title, /^=\?UTF-8\?B\?/);
    assert.equal(req.body, 'my-app: Task complete', 'body is UTF-8 text, never header-encoded');
    assert.equal(req.headers.Tags, 'x');
  });
});

describe('buildNtfyRequest', () => {
  const ntfyConfig = {
    server: 'https://ntfy.sh',
    topic: 'test-topic-123',
    icon: 'https://example.com/icon.png',
    click: 'https://example.com',
  };

  it('builds correct URL', () => {
    const req = buildNtfyRequest(ntfyConfig, {
      title: 'Claude Code',
      message: 'Task complete',
      priority: 'default',
      ntfyTags: 'check',
    });
    assert.equal(req.url, 'https://ntfy.sh/test-topic-123');
  });

  it('sets correct headers with notification icon', () => {
    const req = buildNtfyRequest(ntfyConfig, {
      title: 'Codex',
      message: 'Needs input',
      priority: 'urgent',
      ntfyTags: 'bell,warning',
      icon: 'https://example.com/codex-icon.png',
    });
    assert.equal(req.headers.Title, 'Codex');
    assert.equal(req.headers.Priority, 'urgent');
    assert.equal(req.headers.Tags, 'bell,warning');
    assert.equal(req.headers.Icon, 'https://example.com/codex-icon.png');
    assert.equal(req.headers.Click, 'https://example.com');
  });

  it('falls back to ntfyConfig icon when notification has none', () => {
    const req = buildNtfyRequest(ntfyConfig, {
      title: 'Claude',
      message: 'Done',
      priority: 'default',
      ntfyTags: '',
    });
    assert.equal(req.headers.Icon, 'https://example.com/icon.png');
  });

  it('uses message as body', () => {
    const req = buildNtfyRequest(ntfyConfig, {
      title: 'Test',
      message: 'Hello world',
      priority: 'default',
      ntfyTags: '',
    });
    assert.equal(req.body, 'Hello world');
  });

  it('omits empty tags header', () => {
    const req = buildNtfyRequest(ntfyConfig, {
      title: 'Test',
      message: 'msg',
      priority: 'default',
      ntfyTags: '',
    });
    assert.equal(req.headers.Tags, undefined);
  });

  it('strips trailing slash from server', () => {
    const req = buildNtfyRequest(
      { ...ntfyConfig, server: 'https://ntfy.sh/' },
      { title: 'T', message: 'm', priority: 'default', ntfyTags: '' }
    );
    assert.equal(req.url, 'https://ntfy.sh/test-topic-123');
  });
});
