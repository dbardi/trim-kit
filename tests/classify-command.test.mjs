import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTrim } from '../hooks/classify-command.mjs';

const BACKSLASH = String.fromCharCode(92);

const verdicts = (title, expected, commands) => {
  describe(title, () => {
    for (const command of commands) {
      test(JSON.stringify(command), () => {
        assert.equal(shouldTrim(command), expected);
      });
    }
  });
};

verdicts('quiet commands are left alone', false, [
  'Get-ChildItem', 'git status', 'echo hi', 'Test-Path foo', 'node --eval 1', '',
]);

verdicts('commands whose output is the answer are left alone', false, [
  'dotnet build --version', 'jest --help', 'tsc -v', 'playwright test --list',
]);

verdicts('watch modes and servers are left alone', false, [
  'jest --watch', 'vitest --watchAll', 'npm run dev', 'npm run start', 'npm run serve',
]);

verdicts('commands already writing to a file are left alone', false, [
  'pnpm build > build.log',
]);

verdicts('package managers and compilers are trimmed', true, [
  'pnpm install', 'pnpm test', 'pnpm build', 'npm ci', 'yarn build', 'dotnet build', 'dotnet test',
  'msbuild', 'mvn clean', 'cargo build', 'go test', 'make', 'pip install requests', 'gradlew build',
]);

verdicts('test runners are trimmed however they are invoked', true, [
  'jest', 'tsc --noEmit', 'eslint .', 'vitest', 'playwright test', 'node_modules/.bin/jest',
  ['.', 'node_modules', '.bin', 'jest.cmd'].join(BACKSLASH),
]);

verdicts('a noisy statement is found anywhere in the command', true, [
  'cd apps/web; pnpm build',
  'pnpm install && pnpm test',
  'Set-Location C:/repo\n.\\node_modules\\.bin\\jest.cmd',
  "$env:CI = '1'\npnpm test",
]);
