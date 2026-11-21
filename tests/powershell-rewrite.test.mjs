import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rewritePowerShell } from '../hooks/powershell-rewrite.mjs';

const BACKSLASH = String.fromCharCode(92);
const FILTER = fileURLToPath(new URL('../hooks/trim-output.mjs', import.meta.url));
const BASH_CAPTURE = /\}\s*>\s*('[^']*'|\S+)\s*2>&1/;

const toPosix = (path) => path.replaceAll(BACKSLASH, '/');
const rewrite = (command) => rewritePowerShell(command, FILTER);

describe('the PowerShell rewrite shape', () => {
  const result = rewrite('dotnet build');

  test('captures before filtering because a pipeline would report the filter\'s exit code', () => {
    assert.ok(result.includes('$o = & {\ndotnet build\n} 2>&1 | Out-String -Stream; '));
  });

  test('merges stderr so failures are not lost', () => {
    assert.ok(result.includes('2>&1'));
  });

  test('captures the exit code before the filter overwrites it', () => {
    assert.ok(result.includes('$c = $LASTEXITCODE'));
  });

  test('re-raises the native exit code, else 1 after an error, else 0', () => {
    assert.ok(result.endsWith('exit $(if ($null -ne $c) { $c } elseif ($f) { 1 } else { 0 })'));
  });

  test('stays within Windows PowerShell 5.1 syntax', () => {
    assert.ok(!result.includes('??'));
  });

  test('degrades to raw output when the filter is missing', () => {
    assert.ok(result.includes('if (Test-Path '));
    assert.ok(result.includes('else { $o }'));
  });

  test('invokes the interpreter running this hook, not a bare node', () => {
    assert.ok(result.includes(`& "${toPosix(process.execPath)}" "${toPosix(FILTER)}"`));
  });

  test('carries no backslash paths', () => {
    assert.ok(!result.includes(BACKSLASH));
  });

  test('carries no Bash syntax', () => {
    assert.doesNotMatch(result, BASH_CAPTURE);
  });
});

const powershellIsAvailable = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0']).status === 0;

describe('the PowerShell rewrite keeps PowerShell behavior', { skip: !powershellIsAvailable && 'needs powershell.exe' }, () => {
  const runPowerShell = (script) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' });
  };

  test('a failing native command keeps its exit code', () => {
    assert.equal(runPowerShell(rewrite('cmd /c "exit 3"')).status, 3);
  });

  test('an unknown command fails when no native command ran', () => {
    const run = runPowerShell(rewrite('No-Such-Command-Anywhere'));
    assert.notEqual(run.status, 0);
  });

  test('a cmdlet error fails when no native command ran', () => {
    const run = runPowerShell(rewrite('Get-Item "C:/no/such/path/anywhere"'));
    assert.notEqual(run.status, 0);
  });

  test('a native command that succeeds stays successful after an earlier handled error', () => {
    const run = runPowerShell(rewrite('Get-Item "C:/no/such/path" -ErrorAction SilentlyContinue; cmd /c "echo ok"'));
    assert.equal(run.status, 0);
  });

  test('a trailing comment does not swallow the closing brace', () => {
    const run = runPowerShell(rewrite('Write-Output fine # note to self'));
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('fine'));
  });

  test('a comment on the last line of a multi-line command does not swallow the closing brace', () => {
    const run = runPowerShell(rewrite('Write-Output fine\n# last line'));
    assert.ok(run.stdout.includes('fine'));
  });

  test('a cross mark on its own buried in long output survives the trim', () => {
    const buried = '1..50 | ForEach-Object { "step $_" }; Write-Output ([string][char]0x2715 + " adds numbers"); '
      + '1..50 | ForEach-Object { "tail $_" }';
    const run = runPowerShell(rewrite(buried));
    assert.ok(run.stdout.includes('✕ adds numbers'));
  });
});
