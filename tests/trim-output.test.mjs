import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trimmed } from '../hooks/trim-output.mjs';

const FILTER = fileURLToPath(new URL('../hooks/trim-output.mjs', import.meta.url));

function runFilter({ args = [], stdin = '' }) {
  const run = spawnSync(process.execPath, [FILTER, ...args], { input: stdin, encoding: 'utf8' });
  return { stdout: run.stdout, status: run.status };
}

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

const numberedLines = (filler, count) => Array.from({ length: count }, (_, i) => `${filler} ${i}`);

describe('long output is trimmed to its summary', () => {
  const result = trimmed(numberedLines('step', 100).join('\n'));

  test('a note says how many lines were hidden', () => {
    assert.ok(result.includes('[trim-output: 75 of 100 lines hidden; re-run with its output redirected to a file for full output]'));
  });

  test('the final 25 lines survive', () => {
    assert.ok(result.includes('step 75\n'));
    assert.ok(result.includes('step 99\n'));
  });

  test('the bulk of the middle is gone', () => {
    assert.ok(!result.includes('step 74\n'));
    assert.ok(!result.includes('step 40\n'));
  });
});

const buriedIn100Lines = (line) => {
  const lines = numberedLines('step', 100);
  lines[40] = line;
  return trimmed(lines.join('\n'));
};

describe('an error buried in the middle is promoted', () => {
  const result = buriedIn100Lines('ERROR: the root cause');

  test('the error line survives', () => {
    assert.ok(result.includes('ERROR: the root cause\n'));
  });

  test('a gap marker counts the lines cut before the summary', () => {
    assert.ok(result.includes('    ... 34 lines omitted ...\n'));
  });

  test('no marker precedes the first kept line', () => {
    assert.ok(result.startsWith('ERROR: the root cause\n'));
  });

  test('the hidden count excludes the promoted line', () => {
    assert.ok(result.includes('[trim-output: 74 of 100 lines hidden;'));
  });
});

describe('lines worth keeping wherever they appear', () => {
  const signals = [
    'npm ERR! code ELIFECYCLE',
    'npm ERR! missing script: build',
    'FAIL  src/a.test.ts',
    'Unhandled exception in worker',
    'Traceback (most recent call last):',
    'warning: unused variable',
    'WARN deprecated package',
    'Cannot find module foo',
    'module not found',
    'x is undefined',
    'ENOENT: no such file',
    'EADDRINUSE: port 3000',
    'src/a.ts(3,9): error TS2322: not assignable',
    '  Expected: 1',
    '- Received: 2',
    '  ● Test suite failed to run',
    '  ✕ adds numbers',
    'Tests:       3 failed, 8 passed',
    'Test Suites: 1 failed',
    'Snapshots:   0 total',
  ];

  for (const line of signals) {
    test(`keeps ${line.trim()}`, () => {
      assert.ok(buriedIn100Lines(line).includes(`${line}\n`));
    });
  }

  test('does not keep an ordinary line', () => {
    assert.ok(!buriedIn100Lines('compiling module 40').includes('compiling module 40'));
  });
});

describe('a wall of passes collapses to the failure', () => {
  test('the failing suite survives and the passing ones do not', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `PASS  suite ${i}`);
    lines[4] = 'FAIL  suite 4';
    const result = trimmed(lines.join('\n'));
    assert.ok(result.includes('FAIL  suite 4\n'));
    assert.ok(!result.includes('PASS  suite 99'));
  });
});

describe('promoted lines are capped', () => {
  const lines = [...numberedLines('error', 150), ...numberedLines('step', 20)];
  const result = trimmed(lines.join('\n'));

  test('only the first 80 survive', () => {
    assert.ok(result.includes('error 79\n'));
    assert.ok(!result.includes('error 80\n'));
  });

  test('the note says how many were capped', () => {
    assert.ok(result.includes('; 65 further matches capped; re-run with its output redirected to a file for full output]'));
  });
});

describe('the trimming threshold', () => {
  test('exactly 60 lines are left alone', () => {
    assert.ok(!trimmed(numberedLines('step', 60).join('\n')).includes(TRIM_NOTE));
  });

  test('61 lines are trimmed', () => {
    assert.ok(trimmed(numberedLines('step', 61).join('\n')).includes(TRIM_NOTE));
  });
});

describe('successful steps are dropped when trimming', () => {
  const mixed = numberedLines('step', 100).map((line, i) => (i % 2 === 0 ? `PASS suite ${i}` : line));
  const result = trimmed(mixed.join('\n'));

  test('no passing line survives', () => {
    assert.ok(!result.includes('PASS'));
  });

  test('the final lines that remain survive', () => {
    assert.ok(result.includes('step 99\n'));
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

describe('the command line, reading standard input', () => {
  test('filters the piped output', () => {
    const { stdout, status } = runFilter({ stdin: 'one\n\ntwo' });
    assert.equal(stdout, 'one\ntwo\n');
    assert.equal(status, 0);
  });

  test('writes characters the console codepage cannot encode as UTF-8', () => {
    assert.equal(runFilter({ stdin: '  ● Test suite failed to run' }).stdout, '  ● Test suite failed to run\n');
  });

  test('replaces bytes that are not UTF-8 rather than failing', () => {
    const run = spawnSync(process.execPath, [FILTER], { input: Buffer.from([0x61, 0xff, 0x62]) });
    assert.equal(run.status, 0);
    assert.equal(run.stdout.toString('utf8'), 'a�b\n');
  });
});

test('arguments are ignored, so the filter only ever reads standard input', () => {
  const { stdout, status } = runFilter({ args: ['/no/such/capture.out', 'failed'], stdin: 'one' });
  assert.equal(stdout, 'one\n');
  assert.equal(status, 0);
});
