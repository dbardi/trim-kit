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
  '(cd apps/web && pnpm build)',
  '& "C:/tools/jest.cmd"',
]);

verdicts('env settings, launchers and paths in front of the tool are seen through', true, [
  'CI=1 npm test',
  'NODE_ENV=test FORCE_COLOR=0 pnpm test',
  'npx jest',
  'npx -y tsc --noEmit',
  'pnpm exec vitest run',
  'pnpm dlx playwright test',
  'yarn dlx eslint .',
  'bunx jest',
  './gradlew build',
  'bin/make',
  'cd app && CI=1 npx jest',
]);

verdicts('a launcher running a quiet tool is left alone', false, [
  'npx prettier --check .',
  'CI=1 git status',
]);

verdicts('exempt words count only in their role', true, [
  'go test -v ./...',
  'dotnet test -v n',
  'npm install --save-dev typescript',
  'cd ~/dev/app && npm test',
  'pnpm build -- --base /start/',
  'pnpm build; pnpm --version',
]);

verdicts('a statement that never finishes leaves the whole command alone', false, [
  'pnpm build && pnpm start',
  'pnpm install && pnpm run serve',
  'npm run dev:web',
  'pnpm dev',
  'pnpm build && vitest --watch',
]);

verdicts('redirects that keep output on screen do not exempt', true, [
  'npm test 2>&1 | tail -50',
  'pnpm build 2>&1',
  'pnpm test 2> errors.log',
  'pnpm test > test.log && pnpm lint',
]);

verdicts('output redirected to a file is left alone', false, [
  'pnpm test >> test.log',
  'pnpm test &> all.log',
  'pnpm test > /dev/null',
  'pnpm test 1> out.log',
  'pnpm test >test.log',
]);

verdicts('quoted text is not a command', false, [
  'echo "a; npm test"',
  'git commit -m "fix; make it work"',
  "echo 'done' | grep 'pnpm build'",
]);
