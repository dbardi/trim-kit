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

    test('long output comes back trimmed', () => {
      assert.ok(runRewritten(shell.hundredLines).stdout.includes('[trim-output: 75 of 100 lines hidden;'));
    });
  });
}
