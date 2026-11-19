import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockReasonFor } from '../hooks/require-subagent-model.mjs';

const blocked = [
  { description: 'd', prompt: 'p' },
  { description: 'd', prompt: 'p', subagent_type: 'Explore' },
  { description: 'd', prompt: 'p', subagent_type: 'software-engineer', model: '' },
  { description: 'd', prompt: 'p', model: '   ' },
];

const allowed = [
  { description: 'd', prompt: 'p', model: 'haiku' },
  { description: 'd', prompt: 'p', subagent_type: 'code-reviewer', model: 'opus' },
  { description: 'd', prompt: 'p', subagent_type: 'fork' },
];

for (const toolInput of blocked) {
  test(`blocks ${JSON.stringify(toolInput)}`, () => {
    assert.ok(blockReasonFor(toolInput), 'expected a block reason');
  });
}

for (const toolInput of allowed) {
  test(`allows ${JSON.stringify(toolInput)}`, () => {
    assert.equal(blockReasonFor(toolInput), undefined);
  });
}

test('blocks a call with no tool input', () => {
  assert.ok(blockReasonFor(undefined));
});

describe('the block reason carries the rubric', () => {
  const reason = blockReasonFor({ prompt: 'p' });

  test('haiku is for lookups, searches and summaries', () => {
    assert.match(reason, /haiku[^.]*lookups[^.]*searches[^.]*summar/i);
  });

  test('sonnet is for routine implementation, tests and straightforward reviews', () => {
    assert.match(reason, /sonnet[^.]*routine implementation[^.]*tests[^.]*straightforward reviews/i);
  });

  test('opus is for design, security, hard debugging and costly mistakes', () => {
    assert.match(reason, /opus[^.]*design[^.]*security[^.]*hard debugging[^.]*costly/i);
  });

  test('it does not point at a file outside the plugin', () => {
    assert.doesNotMatch(reason, /CLAUDE\.md/);
  });
});

describe('the hook protocol', () => {
  const HOOK = fileURLToPath(new URL('../hooks/require-subagent-model.mjs', import.meta.url));

  const runHook = (stdin) => {
    const run = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
    return { status: run.status, stdout: run.stdout };
  };
  const agentCall = (toolInput) => JSON.stringify({ tool_name: 'Agent', tool_input: toolInput });

  test('a launch with no model is denied for PreToolUse', () => {
    const { hookSpecificOutput } = JSON.parse(runHook(agentCall({ prompt: 'p' })).stdout);
    assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(hookSpecificOutput.permissionDecisionReason.includes('haiku'));
  });

  test('a launch that names a model emits nothing', () => {
    assert.equal(runHook(agentCall({ prompt: 'p', model: 'sonnet' })).stdout, '');
  });

  test('a fork emits nothing', () => {
    assert.equal(runHook(agentCall({ prompt: 'p', subagent_type: 'fork' })).stdout, '');
  });

  test('malformed stdin does not take the tool call down', () => {
    const { status, stdout } = runHook('not json at all');
    assert.equal(status, 0);
    assert.equal(stdout, '');
  });
});
