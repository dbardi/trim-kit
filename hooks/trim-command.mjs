import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellQuote } from './shell-quote.mjs';

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
  ['Bash', (command, filterPath) => rewriteBash(command, filterPath)],
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
  return rewrite(command, filterPath);
}

// Captures to a file and then filters it, so the command runs in the current shell and keeps any
// `cd`. It uses no shell expansion, so Claude Code can analyze it statically and asks nothing extra.
export function rewriteBash(command, filterPath = FILTER) {
  const capture = shellQuote(toPosix(join(tmpdir(), `claude-trim-${randomUUID().replaceAll('-', '')}.out`)));
  const runFilter = `${shellQuote(toPosix(process.execPath))} ${shellQuote(toPosix(filterPath))} ${capture}`;
  return `{\n${command}\n} > ${capture} 2>&1 && ${runFilter} ok || ${runFilter} failed`;
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}
