// tests/cli-uninstall-protocol.test.mjs — uninstall removes the agentfocus://
// click-to-focus protocol that toast.ps1 registered, and only when it is ours.
// `reg` is injected, so no test touches the real registry on any OS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeFocusProtocol } from '../cli/uninstall.mjs';

const OURS = '    (Default)    REG_SZ    wscript.exe "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\anotifier\\assets\\windows\\focus.vbs" "%1"';

function fakeReg({ query, del = () => '' }) {
  const calls = [];
  const reg = (args) => {
    calls.push(args);
    if (args[0] === 'query') return query(args);
    if (args[0] === 'delete') return del(args);
    throw new Error(`unexpected reg ${args[0]}`);
  };
  return { reg, calls };
}

test('deletes the key when its command points at our focus.vbs', () => {
  const { reg, calls } = fakeReg({ query: () => OURS });
  const r = removeFocusProtocol({ reg });
  assert.equal(r.ok, true);
  assert.match(r.reason, /removed/);
  assert.deepEqual(calls[0], ['query', 'HKCU\\Software\\Classes\\agentfocus\\shell\\open\\command', '/ve']);
  assert.deepEqual(calls[1], ['delete', 'HKCU\\Software\\Classes\\agentfocus', '/f']);
});

test('leaves a same-named protocol from another program alone', () => {
  const { reg, calls } = fakeReg({ query: () => '    (Default)    REG_SZ    "C:\\Other\\tool.exe" "%1"' });
  const r = removeFocusProtocol({ reg });
  assert.equal(r.ok, true);
  assert.match(r.reason, /another program/);
  assert.equal(calls.some((c) => c[0] === 'delete'), false);
});

test('reports not registered when the key does not exist', () => {
  const { reg, calls } = fakeReg({ query: () => { throw new Error('ERROR: The system was unable to find the specified registry key'); } });
  const r = removeFocusProtocol({ reg });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'not registered');
  assert.equal(calls.length, 1);
});

test('a failed delete is reported as a failure, never thrown', () => {
  const { reg } = fakeReg({ query: () => OURS, del: () => { throw new Error('Access is denied.'); } });
  const r = removeFocusProtocol({ reg });
  assert.equal(r.ok, false);
  assert.match(r.reason, /could not delete .*Access is denied/);
});
