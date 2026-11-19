import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { trimmed } from '../hooks/trim-output.mjs';

const TRIM_NOTE = '[trim-output:';

describe('short output is left alone', () => {
  test('every line survives', () => {
    assert.deepEqual(trimmed('one\ntwo\nthree').trim().split('\n'), ['one', 'two', 'three']);
  });

  test('no trim note is added', () => {
    assert.ok(!trimmed('one\ntwo\nthree').includes(TRIM_NOTE));
  });

  test('successful steps are kept when there is room', () => {
    assert.ok(trimmed('PASS suite a\nPASS suite b').includes('PASS suite a'));
  });
});
