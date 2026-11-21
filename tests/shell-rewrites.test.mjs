import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rewriteBash } from '../hooks/bash-rewrite.mjs';
import { rewritePowerShell } from '../hooks/powershell-rewrite.mjs';

const FILTER = fileURLToPath(new URL('../hooks/trim-output.mjs', import.meta.url));

const runBash = (script) => spawnSync('bash', ['-c', script], { encoding: 'utf8' });
const runPowerShell = (script) => {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' });
};

const SHELLS = [
  {
    name: 'Bash',
    available: spawnSync('bash', ['--version']).status === 0,
    rewrite: rewriteBash,
    run: runBash,
    succeeding: 'echo fine',
    failingWithOutput: 'echo broken; false',
    hundredLines: 'seq 1 100',
  },
  {
    name: 'PowerShell',
    available: spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0']).status === 0,
    rewrite: rewritePowerShell,
    run: runPowerShell,
    succeeding: 'Write-Output fine',
    failingWithOutput: 'cmd /c "echo broken & exit 3"',
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

    test('long output comes back trimmed', () => {
      assert.ok(runRewritten(shell.hundredLines).stdout.includes('[trim-output: 75 of 100 lines hidden;'));
    });
  });
}
