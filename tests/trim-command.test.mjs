import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../hooks/trim-command.mjs';

const BACKSLASH = String.fromCharCode(92);
const POWERSHELL = 'PowerShell';

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
