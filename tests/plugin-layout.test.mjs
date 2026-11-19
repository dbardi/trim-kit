import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pathInRepo = (relative) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const readText = (relative) => readFileSync(pathInRepo(relative), 'utf8');
const readJson = (relative) => JSON.parse(readText(relative));

const frontmatterOf = (relative) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readText(relative));
  return Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const separator = line.indexOf(':');
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
};

describe('the plugin manifest', () => {
  const manifest = readJson('.claude-plugin/plugin.json');

  test('is named trim-kit', () => {
    assert.equal(manifest.name, 'trim-kit');
  });

  test('has a semantic version', () => {
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  });

  test('says what the plugin does', () => {
    assert.ok(manifest.description.length > 0);
  });

  test('credits its author', () => {
    assert.equal(manifest.author.name, 'dbardi');
  });
});

describe('the marketplace', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json');
  const manifest = readJson('.claude-plugin/plugin.json');

  test('has a name and an owner', () => {
    assert.equal(marketplace.name, 'trim-kit');
    assert.equal(marketplace.owner.name, 'dbardi');
  });

  test('lists the one plugin under the same name as its manifest', () => {
    assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), [manifest.name]);
  });

  test('serves the plugin from the repository root', () => {
    assert.equal(marketplace.plugins[0].source, './');
  });
});

describe('the hook registrations', () => {
  const { hooks } = readJson('hooks/hooks.json');
  const registrations = hooks.PreToolUse;
  const commandFor = (matcher) => registrations.find((entry) => entry.matcher === matcher).hooks[0].command;
  const guarded = (script) => `command -v node >/dev/null 2>&1 || exit 0; node "\${CLAUDE_PLUGIN_ROOT}/hooks/${script}"`;

  test('registers only PreToolUse', () => {
    assert.deepEqual(Object.keys(hooks), ['PreToolUse']);
  });

  test('the trimming hook runs on the shell tools', () => {
    assert.equal(commandFor('Bash|PowerShell'), guarded('trim-command.mjs'));
  });

  test('the model check runs on subagent launches', () => {
    assert.equal(commandFor('Agent|Task'), guarded('require-subagent-model.mjs'));
  });

  test('every registered script exists', () => {
    for (const script of ['trim-command.mjs', 'require-subagent-model.mjs']) {
      assert.ok(existsSync(pathInRepo(`hooks/${script}`)), script);
    }
  });

  test('every hook is a command with a timeout', () => {
    for (const { hooks: handlers } of registrations) {
      for (const handler of handlers) {
        assert.equal(handler.type, 'command');
        assert.ok(handler.timeout > 0);
      }
    }
  });
});

describe('the agent', () => {
  const agent = frontmatterOf('agents/repo-search.md');

  test('is named repo-search', () => {
    assert.equal(agent.name, 'repo-search');
  });

  test('says when to use it', () => {
    assert.ok(agent.description.length > 0);
  });

  test('is limited to read-only tools', () => {
    assert.equal(agent.tools, 'Glob, Grep, Read');
  });
});

describe('the output style', () => {
  const style = frontmatterOf('output-styles/clear-concise-actionable.md');

  test('has a name', () => {
    assert.equal(style.name, 'Clear Concise Actionable');
  });

  test('says what it does', () => {
    assert.ok(style.description.length > 0);
  });

  test('keeps the coding instructions', () => {
    assert.equal(style['keep-coding-instructions'], 'true');
  });
});
