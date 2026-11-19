import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILTER = resolve(dirname(fileURLToPath(import.meta.url)), 'trim-output.mjs');

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
    'make\\b',
  ].join('|') + ')',
  'im',
);

// Commands the pipe would break, or whose output is the point.
const EXEMPT = new RegExp([
  '--help',
  String.raw`-h\b`,
  '--version',
  String.raw`-v\b`,
  '--watch', // also covers --watchAll
  String.raw`\bdev\b`,
  String.raw`\bserve\b`,
  String.raw`\bstart\b`,
  String.raw`--list\b`,
  String.raw`>\s*\S`, // already redirecting to a file
].join('|'), 'i');

const REWRITERS = new Map([
  ['Bash', (command) => command],
  ['PowerShell', (command) => command],
]);

export function decide(command, toolName, filterPath = FILTER) {
  const rewrite = REWRITERS.get(toolName);
  if (!rewrite || !command || EXEMPT.test(command) || !NOISY.test(command)) {
    return undefined;
  }
  if (!existsSync(filterPath)) {
    return undefined;
  }
  return rewrite(command);
}
