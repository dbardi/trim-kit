import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { trimmed } from '../hooks/trim-output.mjs';

const TRIM_NOTE = '[trim-output:';
const BACKSLASH = String.fromCharCode(92);

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

describe('noise is dropped', () => {
  const survives = (line) => trimmed(`keep me\n${line}\nkeep me too`).includes(line);

  test('library stack frames', () => {
    assert.ok(!survives('      at Parser.parse (node_modules/@babel/parser/lib/index.js:1:1)'));
  });

  test('library stack frames on Windows paths', () => {
    const path = ['C:', 'node_modules', 'babel', 'index.js:1:1'].join(BACKSLASH);
    assert.ok(!survives(`      at Parser.parse (${path})`));
  });

  for (const line of ['Downloading react-native', 'Progress: resolved 900', 'Packages: +122', 'added 40 packages']) {
    test(`download and progress chatter: ${line}`, () => {
      assert.ok(!survives(line));
    });
  }

  test('blank lines', () => {
    assert.deepEqual(trimmed('a\n\n\n\nb').trim().split('\n'), ['a', 'b']);
  });

  test('empty output stays empty', () => {
    assert.equal(trimmed(''), '');
  });
});

describe('stack frames that only look like library frames are kept', () => {
  const survives = (line) => trimmed(`noise\n${line}\nnoise`).includes(line);

  test('frames in your own source', () => {
    assert.ok(survives('      at handler (apps/web/src/route.ts:12:3)'));
  });

  test('a directory that merely looks like node_modules', () => {
    assert.ok(survives('      at x (src/mynode_modules/a.ts:1:1)'));
  });
});

describe('terminal control characters', () => {
  test('ANSI color codes are stripped', () => {
    const result = trimmed('\x1b[31mERROR: red\x1b[0m');
    assert.ok(result.includes('ERROR: red'));
    assert.ok(!result.includes('\x1b'));
  });

  test('carriage return overwrites keep only the final state', () => {
    assert.equal(trimmed('Building 10%\rBuilding 90%\rBuilding done').trim(), 'Building done');
  });

  test('characters the Windows console cannot encode survive', () => {
    assert.ok(trimmed('  ● Test suite failed to run').includes('●'));
  });
});
