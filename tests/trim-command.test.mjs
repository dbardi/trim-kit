import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../hooks/trim-command.mjs';
import { BASH_CAPTURE } from './helpers/shells.mjs';

const POWERSHELL = 'PowerShell';

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

test('a command the shell rewrite declines is untouched', () => {
  assert.equal(decide("trap 'echo bye' EXIT; make", 'Bash'), undefined);
});

test('a missing filter leaves the command untouched', () => {
  assert.equal(decide('pnpm test', 'Bash', '/nonexistent/trim-output.mjs'), undefined);
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
    assert.match(decide('pnpm test', 'Bash'), BASH_CAPTURE);
  });

  test('the Bash syntax does not leak into PowerShell', () => {
    assert.doesNotMatch(decide('pnpm test', 'PowerShell'), BASH_CAPTURE);
  });
});
