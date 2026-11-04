import assert from 'node:assert/strict';
import test from 'node:test';
import { kioskShortcut } from '../src/utils/kioskShortcuts.ts';

test('F8 opens admin; Ctrl+F8 keeps labels separate; Ctrl+F12 remains supported', () => {
  const key = { key: 'F8', code: 'F8', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false };
  assert.equal(kioskShortcut(key), 'admin');
  assert.equal(kioskShortcut({ ...key, ctrlKey: true }), 'labels');
  assert.equal(kioskShortcut({ ...key, key: 'F12', code: 'F12', ctrlKey: true }), 'admin');
  assert.equal(kioskShortcut({ ...key, repeat: true }), null);
  assert.equal(kioskShortcut({ ...key, altKey: true }), null);
  assert.equal(kioskShortcut({ ...key, key: 'a', code: 'KeyA' }), null);
});
