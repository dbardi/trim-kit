import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rewriteBash, shellQuote } from '../hooks/bash-rewrite.mjs';
import { toPosix } from '../hooks/posix-path.mjs';
import { BASH_CAPTURE, FILTER, bashIsAvailable, runBash } from './helpers/shells.mjs';

const captureFileOf = (rewrite) => BASH_CAPTURE.exec(rewrite)[1].replaceAll("'", '');
const rewrite = (command) => rewriteBash(command, FILTER);

describe('the Bash rewrite shape', () => {
  const result = rewrite('dotnet build');

  test('merges stderr so failures are not lost', () => {
    assert.ok(result.includes('2>&1'));
  });

  test('asks the shell to expand nothing Claude Code cannot analyze', () => {
    assert.ok(!result.includes('$'));
    assert.ok(!result.includes('`'));
  });

  test('calls the filter as a plain command an allow rule can match', () => {
    assert.ok(result.includes(`${shellQuote(toPosix(process.execPath))} ${shellQuote(toPosix(FILTER))} `));
  });

  test('filters and removes the capture file when the shell exits', () => {
    const capture = shellQuote(toPosix(captureFileOf(result)));
    assert.ok(result.startsWith('exec 8>&1 9>&2\ntrap "'));
    assert.ok(result.includes(`< ${capture} >&8 2>&9; rm -f ${capture}" EXIT\n`));
  });

  test('each rewrite captures to its own file', () => {
    assert.notEqual(captureFileOf(rewrite('dotnet build')), captureFileOf(rewrite('dotnet build')));
  });

  test('the command is never placed in a pipeline', () => {
    assert.ok(!result.includes('} 2>&1 |'));
  });

  test('a multi-line command is captured as a whole', () => {
    assert.ok(rewrite('cd /repo\npnpm test').includes('cd /repo\npnpm test\n}'));
  });

  test('carries no PowerShell syntax', () => {
    assert.ok(!result.includes('LASTEXITCODE'));
  });
});

describe('commands the Bash rewrite cannot wrap safely are left as they are', () => {
  test('a command that sets its own trap, which would replace the filter', () => {
    assert.equal(rewrite("trap 'echo bye' EXIT; make"), undefined);
  });

  test('a command that runs exec, which replaces the shell before the trap can run', () => {
    assert.equal(rewrite('cd app && exec make'), undefined);
  });

  for (const command of ['make; echo trap', 'pnpm run trap-test', 'git log --grep=exec && make']) {
    test(`the words trap and exec elsewhere still get wrapped: ${command}`, () => {
      assert.notEqual(rewrite(command), undefined);
    });
  }

  for (const character of ['"', '$', '`', "'"]) {
    test(`a filter path containing ${character}, which the trap's double quotes cannot hold`, () => {
      assert.equal(rewriteBash('make', `/opt/odd${character}name/trim-output.mjs`), undefined);
    });
  }
});

describe('the Bash rewrite keeps Bash behavior', { skip: !bashIsAvailable && 'needs bash' }, () => {
  test('a cd inside the command carries to what follows', () => {
    const run = runBash(`${rewrite('cd /')}\npwd`);
    assert.equal(run.stdout.trim().split('\n').at(-1), '/');
  });

  test('the capture file is removed', () => {
    const rewritten = rewrite('echo fine');
    runBash(rewritten);
    assert.equal(existsSync(captureFileOf(rewritten)), false);
  });

  for (const command of ['f() { echo from inside; exit 6; }; f', 'set -e; g() { echo from inside; false; }; g']) {
    test(`output still shows when a function ends the shell: ${command}`, () => {
      assert.ok(runBash(rewrite(command)).stdout.includes('from inside'));
    });
  }

  test('a filter path with a space still runs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'trim kit '));
    const filter = join(directory, 'trim-output.mjs');
    copyFileSync(FILTER, filter);
    const run = runBash(rewriteBash('seq 1 100', filter));
    rmSync(directory, { recursive: true });
    assert.ok(run.stdout.includes('[trim-output: 75 of 100 lines hidden;'));
  });

  describe('a command that calls exit itself', () => {
    const rewritten = rewrite('echo before leaving; exit 3');
    const run = runBash(rewritten);

    test('keeps its exit code', () => {
      assert.equal(run.status, 3);
    });

    test('still shows its output', () => {
      assert.ok(run.stdout.includes('before leaving'));
    });

    test('leaves no capture file behind', () => {
      assert.equal(existsSync(captureFileOf(rewritten)), false);
    });
  });
});

describe('shell quoting', () => {
  test('leaves a plain path untouched', () => {
    assert.equal(shellQuote('/tmp/trim-kit-1.out'), '/tmp/trim-kit-1.out');
  });

  test('leaves a Windows drive path with forward slashes untouched', () => {
    assert.equal(shellQuote('C:/Users/me/node.exe'), 'C:/Users/me/node.exe');
  });

  test('single-quotes a value with a space', () => {
    assert.equal(shellQuote('C:/Program Files/nodejs/node.exe'), "'C:/Program Files/nodejs/node.exe'");
  });

  test('single-quotes a value with a dollar sign so the shell cannot expand it', () => {
    assert.equal(shellQuote('/tmp/$HOME'), "'/tmp/$HOME'");
  });

  test('closes and reopens the quotes around an embedded single quote', () => {
    assert.equal(shellQuote("it's"), `'it'"'"'s'`);
  });

  test('quotes an empty value so it stays an argument', () => {
    assert.equal(shellQuote(''), "''");
  });
});
