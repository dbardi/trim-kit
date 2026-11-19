import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decide, rewriteBash } from '../hooks/trim-command.mjs';
import { shellQuote } from '../hooks/shell-quote.mjs';

const BACKSLASH = String.fromCharCode(92);
const POWERSHELL = 'PowerShell';
const FILTER = fileURLToPath(new URL('../hooks/trim-output.mjs', import.meta.url));
const CAPTURE = /\}\s*>\s*('[^']*'|\S+)\s*2>&1/;

const toPosix = (path) => path.replaceAll(BACKSLASH, '/');
const captureFileOf = (rewrite) => CAPTURE.exec(rewrite)[1].replaceAll("'", '');

const wrapped = (command, tool = POWERSHELL) => decide(command, tool);

describe('quiet commands are untouched', () => {
  for (const command of ['Get-ChildItem', 'git status', 'echo hi', 'Test-Path foo', 'node --eval 1']) {
    test(command, () => {
      assert.equal(wrapped(command), undefined);
    });
  }

  test('an empty command', () => {
    assert.equal(wrapped(''), undefined);
  });
});

describe('only the shell tools are this hook\'s business', () => {
  for (const tool of ['Write', 'Read', 'Glob', '', 'constructor', 'toString']) {
    test(`not ${tool || 'an empty tool name'}`, () => {
      assert.equal(wrapped('pnpm test', tool), undefined);
    });
  }
});

describe('exemptions are honored', () => {
  const informational = ['dotnet build --version', 'jest --help', 'tsc -v', 'playwright test --list'];
  for (const command of informational) {
    test(`output that is the answer: ${command}`, () => {
      assert.equal(wrapped(command), undefined);
    });
  }

  const neverTerminating = ['jest --watch', 'vitest --watchAll', 'npm run dev', 'npm run start', 'npm run serve'];
  for (const command of neverTerminating) {
    test(`watch modes and servers: ${command}`, () => {
      assert.equal(wrapped(command), undefined);
    });
  }

  test('a command already redirecting to a file', () => {
    assert.equal(wrapped('pnpm build > build.log'), undefined);
  });

  test('a missing filter leaves the command untouched', () => {
    assert.equal(decide('pnpm test', 'Bash', '/nonexistent/trim-output.mjs'), undefined);
  });
});

describe('noisy commands are wrapped', () => {
  const packageManagersAndCompilers = [
    'pnpm install', 'pnpm test', 'pnpm build', 'npm ci', 'yarn build', 'dotnet build', 'dotnet test',
    'msbuild', 'mvn clean', 'cargo build', 'go test', 'make', 'pip install requests', 'gradlew build',
  ];
  for (const command of packageManagersAndCompilers) {
    test(command, () => {
      assert.notEqual(wrapped(command), undefined);
    });
  }

  const testRunners = [
    'jest', 'tsc --noEmit', 'eslint .', 'vitest', 'playwright test', 'node_modules/.bin/jest',
    ['.', 'node_modules', '.bin', 'jest.cmd'].join(BACKSLASH),
  ];
  for (const command of testRunners) {
    test(`test runner however it is invoked: ${command}`, () => {
      assert.notEqual(wrapped(command), undefined);
    });
  }

  test('after a statement separator', () => {
    assert.notEqual(wrapped('cd apps/web; pnpm build'), undefined);
  });

  test('after a conditional separator', () => {
    assert.notEqual(wrapped('pnpm install && pnpm test'), undefined);
  });

  test('on a later line of a multi-line command', () => {
    assert.notEqual(wrapped('Set-Location C:/repo\n.\\node_modules\\.bin\\jest.cmd'), undefined);
  });

  test('a quiet first line does not shield a noisy second', () => {
    assert.notEqual(wrapped("$env:CI = '1'\npnpm test"), undefined);
  });
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
