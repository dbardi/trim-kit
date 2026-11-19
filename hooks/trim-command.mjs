// Matched at the start of any line, or after a statement separator, so "cd foo; pnpm test" is caught.
const NOISY = new RegExp(
  '(^|[;&|]\\s*)(' + [
    String.raw`pnpm\s+(install|i|add|update|build|test|lint|typecheck)`,
    String.raw`npm\s+(install|ci|test|run|rebuild)`,
    String.raw`yarn\s+(install|add|build|test|lint)`,
    String.raw`dotnet\s+(build|test|restore|publish|pack)`,
    'msbuild',
    String.raw`(\S*[/\\])?(jest|tsc|eslint|vitest|playwright)\b`,
    String.raw`gradlew?\s+(build|test)`,
    String.raw`mvn\s+(clean|install|test|package)`,
    String.raw`(pip|pip3)\s+install`,
    String.raw`cargo\s+(build|test)`,
    String.raw`go\s+(build|test)`,
    String.raw`make\b`,
  ].join('|') + ')',
  'im',
);

const REWRITERS = new Map([
  ['Bash', (command) => command],
  ['PowerShell', (command) => command],
]);

export function decide(command, toolName) {
  const rewrite = REWRITERS.get(toolName);
  if (!rewrite || !command || !NOISY.test(command)) {
    return undefined;
  }
  return rewrite(command);
}
