import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteBash } from '../hooks/bash-rewrite.mjs';
import { rewritePowerShell } from '../hooks/powershell-rewrite.mjs';
import { FILTER, bashIsAvailable, powershellIsAvailable, runBash, runPowerShell } from './helpers/shells.mjs';

const SHELLS = [
  {
    name: 'Bash',
    available: bashIsAvailable,
    rewrite: rewriteBash,
    run: runBash,
    succeeding: 'echo fine',
    failingWithOutput: 'echo broken; false',
    failingWithThree: 'echo broken; (exit 3)',
    stderrOnly: 'echo oops >&2',
    trailingComment: 'echo fine # note to self',
    hundredLines: 'seq 1 100',
  },
  {
    name: 'PowerShell',
    available: powershellIsAvailable,
    rewrite: rewritePowerShell,
    run: runPowerShell,
    succeeding: 'Write-Output fine',
    failingWithOutput: 'cmd /c "echo broken & exit 1"',
    failingWithThree: 'cmd /c "echo broken & exit 3"',
    stderrOnly: 'cmd /c "echo oops 1>&2"',
    trailingComment: 'Write-Output fine # note to self',
    hundredLines: '1..100 | ForEach-Object { "line $_" }',
  },
];

for (const shell of SHELLS) {
  describe(`the ${shell.name} rewrite behaves like the original command`, { skip: !shell.available && `needs ${shell.name}` }, () => {
    const runRewritten = (command) => shell.run(shell.rewrite(command, FILTER));

    test('a succeeding command still succeeds', () => {
      assert.equal(runRewritten(shell.succeeding).status, 0);
    });

    test('a failing command still fails and keeps its output', () => {
      const run = runRewritten(shell.failingWithOutput);
      assert.notEqual(run.status, 0);
      assert.ok(run.stdout.includes('broken'));
    });

    test('a failing command keeps its exact exit code', () => {
      assert.equal(runRewritten(shell.failingWithThree).status, 3);
    });

    test('error output comes back with the rest', () => {
      assert.ok(runRewritten(shell.stderrOnly).stdout.includes('oops'));
    });

    test('a trailing comment does not swallow the end of the wrapper', () => {
      const run = runRewritten(shell.trailingComment);
      assert.equal(run.status, 0);
      assert.ok(run.stdout.includes('fine'));
    });

    test('long output comes back trimmed', () => {
      assert.ok(runRewritten(shell.hundredLines).stdout.includes('[trim-output: 75 of 100 lines hidden;'));
    });
  });
}
