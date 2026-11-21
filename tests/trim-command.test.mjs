import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decide, rewriteBash, rewritePowerShell } from '../hooks/trim-command.mjs';
import { shellQuote } from '../hooks/shell-quote.mjs';

const BACKSLASH = String.fromCharCode(92);
const POWERSHELL = 'PowerShell';
const FILTER = fileURLToPath(new URL('../hooks/trim-output.mjs', import.meta.url));
const CAPTURE = /\}\s*>\s*('[^']*'|\S+)\s*2>&1/;

const toPosix = (path) => path.replaceAll(BACKSLASH, '/');
const captureFileOf = (rewrite) => CAPTURE.exec(rewrite)[1].replaceAll("'", '');

const wrapped = (command, tool = POWERSHELL) => decide(command, tool);

describe('the classifier decides what is wrapped', () => {
  test('a command it leaves alone is untouched', () => {
    assert.equal(wrapped('git status'), undefined);
  });

  test('a command it trims is wrapped', () => {
    assert.notEqual(wrapped('pnpm test'), undefined);
  });

  test('a missing command is untouched', () => {
    assert.equal(wrapped(undefined), undefined);
  });
});

describe('only the shell tools are this hook\'s business', () => {
  for (const tool of ['Write', 'Read', 'Glob', '', 'constructor', 'toString']) {
    test(`not ${tool || 'an empty tool name'}`, () => {
      assert.equal(wrapped('pnpm test', tool), undefined);
    });
  }
});

test('a missing filter leaves the command untouched', () => {
  assert.equal(decide('pnpm test', 'Bash', '/nonexistent/trim-output.mjs'), undefined);
});

describe('the Bash rewrite shape', () => {
  const result = rewriteBash('dotnet build');

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

  test('passes the capture file and the outcome to the filter on each side of && ||', () => {
    const capture = shellQuote(toPosix(captureFileOf(result)));
    assert.ok(result.includes(`${capture} ok || `));
    assert.ok(result.endsWith(`${capture} failed`));
  });

  test('each rewrite captures to its own file', () => {
    assert.notEqual(captureFileOf(rewriteBash('dotnet build')), captureFileOf(rewriteBash('dotnet build')));
  });

  test('the command is never placed in a pipeline', () => {
    assert.ok(!result.includes('} 2>&1 |'));
  });

  test('a multi-line command is captured as a whole', () => {
    assert.ok(rewriteBash('cd /repo\npnpm test').includes('cd /repo\npnpm test\n}'));
  });

  test('carries no PowerShell syntax', () => {
    assert.ok(!result.includes('LASTEXITCODE'));
  });
});

const bashIsAvailable = spawnSync('bash', ['--version']).status === 0;

describe('the Bash rewrite behaves like the original command', { skip: !bashIsAvailable && 'needs bash' }, () => {
  const runBash = (script) => spawnSync('bash', ['-c', script], { encoding: 'utf8' });

  test('a succeeding command still succeeds', () => {
    assert.equal(runBash(rewriteBash('echo fine')).status, 0);
  });

  test('a failing command still fails and keeps its output', () => {
    const run = runBash(rewriteBash('echo broken; false'));
    assert.notEqual(run.status, 0);
    assert.ok(run.stdout.includes('broken'));
  });

  test('a cd inside the command carries to what follows', () => {
    const run = runBash(`${rewriteBash('cd /')}\npwd`);
    assert.equal(run.stdout.trim().split('\n').at(-1), '/');
  });

  test('the capture file is removed', () => {
    const rewrite = rewriteBash('echo fine');
    runBash(rewrite);
    assert.equal(existsSync(captureFileOf(rewrite)), false);
  });

  test('long output comes back trimmed', () => {
    const run = runBash(rewriteBash('seq 1 100'));
    assert.ok(run.stdout.includes('[trim-output: 75 of 100 lines hidden;'));
  });
});

describe('wrapping is idempotent', () => {
  for (const tool of ['Bash', POWERSHELL]) {
    test(`an already wrapped ${tool} command is not wrapped again`, () => {
      assert.equal(decide(wrapped('pnpm test', tool), tool), undefined);
    });
  }

  test('a command that already pipes through the filter is left alone', () => {
    assert.equal(wrapped('pnpm test | node hooks/trim-output.mjs', 'Bash'), undefined);
  });
});

describe('the hook protocol', () => {
  const HOOK = fileURLToPath(new URL('../hooks/trim-command.mjs', import.meta.url));

  const runHook = (stdin) => {
    const run = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
    return { status: run.status, output: JSON.parse(run.stdout) };
  };
  const payload = (toolInput, toolName = POWERSHELL) => JSON.stringify({ tool_name: toolName, tool_input: toolInput });

  test('an untouched command emits an empty object', () => {
    assert.deepEqual(runHook(payload({ command: 'echo hi' })).output, {});
  });

  test('a wrapped command emits updated input for PreToolUse', () => {
    const { hookSpecificOutput } = runHook(payload({ command: 'pnpm test' })).output;
    assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.ok(hookSpecificOutput.updatedInput.command.includes('Out-String'));
  });

  test('other tool input fields survive the rewrite', () => {
    const { updatedInput } = runHook(payload({ command: 'pnpm test', description: 'run tests', timeout: 600000 })).output.hookSpecificOutput;
    assert.equal(updatedInput.description, 'run tests');
    assert.equal(updatedInput.timeout, 600000);
  });

  test('a payload with no tool input emits an empty object', () => {
    assert.deepEqual(runHook(JSON.stringify({ tool_name: POWERSHELL })).output, {});
  });

  test('malformed stdin does not take the tool call down', () => {
    const { status, output } = runHook('not json at all');
    assert.equal(status, 0);
    assert.deepEqual(output, {});
  });
});

describe('each shell gets its own syntax', () => {
  test('PowerShell gets the Out-String capture', () => {
    assert.ok(decide('pnpm test', 'PowerShell').includes('Out-String'));
  });

  test('Bash gets the brace group redirect', () => {
    assert.match(decide('pnpm test', 'Bash'), CAPTURE);
  });

  test('the Bash syntax does not leak into PowerShell', () => {
    assert.doesNotMatch(decide('pnpm test', 'PowerShell'), CAPTURE);
  });
});

describe('the PowerShell rewrite shape', () => {
  const result = rewritePowerShell('dotnet build');

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
    assert.doesNotMatch(result, CAPTURE);
  });
});

const powershellIsAvailable = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0']).status === 0;

describe('the PowerShell rewrite behaves like the original command', { skip: !powershellIsAvailable && 'needs powershell.exe' }, () => {
  const runPowerShell = (script) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' });
  };

  test('a succeeding command still succeeds', () => {
    assert.equal(runPowerShell(rewritePowerShell('Write-Output fine')).status, 0);
  });

  test('a failing native command keeps its exit code and its output', () => {
    const run = runPowerShell(rewritePowerShell('cmd /c "echo broken & exit 3"'));
    assert.equal(run.status, 3);
    assert.ok(run.stdout.includes('broken'));
  });

  test('long output comes back trimmed', () => {
    const run = runPowerShell(rewritePowerShell('1..100 | ForEach-Object { "line $_" }'));
    assert.ok(run.stdout.includes('[trim-output: 75 of 100 lines hidden;'));
  });

  test('an unknown command fails when no native command ran', () => {
    const run = runPowerShell(rewritePowerShell('No-Such-Command-Anywhere'));
    assert.notEqual(run.status, 0);
  });

  test('a cmdlet error fails when no native command ran', () => {
    const run = runPowerShell(rewritePowerShell('Get-Item "C:/no/such/path/anywhere"'));
    assert.notEqual(run.status, 0);
  });

  test('a native command that succeeds stays successful after an earlier handled error', () => {
    const run = runPowerShell(rewritePowerShell('Get-Item "C:/no/such/path" -ErrorAction SilentlyContinue; cmd /c "echo ok"'));
    assert.equal(run.status, 0);
  });

  test('a trailing comment does not swallow the closing brace', () => {
    const run = runPowerShell(rewritePowerShell('Write-Output fine # note to self'));
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('fine'));
  });

  test('a comment on the last line of a multi-line command does not swallow the closing brace', () => {
    const run = runPowerShell(rewritePowerShell('Write-Output fine\n# last line'));
    assert.ok(run.stdout.includes('fine'));
  });

  test('a cross mark on its own buried in long output survives the trim', () => {
    const buried = '1..50 | ForEach-Object { "step $_" }; Write-Output ([string][char]0x2715 + " adds numbers"); '
      + '1..50 | ForEach-Object { "tail $_" }';
    const run = runPowerShell(rewritePowerShell(buried));
    assert.ok(run.stdout.includes('✕ adds numbers'));
  });
});
