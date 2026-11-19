import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellQuote } from './shell-quote.mjs';

const FILTER_NAME = 'trim-output.mjs';
const FILTER = resolve(dirname(fileURLToPath(import.meta.url)), FILTER_NAME);

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
  ['PowerShell', (command, filterPath) => rewritePowerShell(command, filterPath)],
]);

export function decide(command, toolName, filterPath = FILTER) {
  const rewrite = REWRITERS.get(toolName);
  if (!rewrite || !command || command.includes(FILTER_NAME) || EXEMPT.test(command) || !NOISY.test(command)) {
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
  const capture = shellQuote(toPosix(join(tmpdir(), `trim-kit-${randomUUID().replaceAll('-', '')}.out`)));
  const runFilter = `${shellQuote(toPosix(process.execPath))} ${shellQuote(toPosix(filterPath))} ${capture}`;
  return `{\n${command}\n} > ${capture} 2>&1 && ${runFilter} ok || ${runFilter} failed`;
}

// PowerShell has no pipefail, so it captures first, keeps $LASTEXITCODE and re-raises it after the filter.
// It uses only Windows PowerShell 5.1 syntax, and shows the raw output when the filter file is missing.
export function rewritePowerShell(command, filterPath = FILTER) {
  const interpreter = `"${toPosix(process.execPath)}"`;
  const filter = `"${toPosix(filterPath)}"`;
  return `$o = & { ${command} } 2>&1 | Out-String -Stream; `
    + '$c = $LASTEXITCODE; '
    + `if (Test-Path ${filter}) { $o | & ${interpreter} ${filter} } else { $o }; `
    + 'exit $(if ($null -eq $c) { 0 } else { $c })';
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

// Reads a PreToolUse payload from stdin and prints "{}" or the same tool input with the command rewritten.
function main() {
  const payload = parsePayload(readFileSync(0, 'utf8'));
  const toolInput = payload.tool_input ?? {};
  const rewritten = decide(toolInput.command, payload.tool_name);
  if (rewritten === undefined) {
    process.stdout.write('{}');
    return;
  }
  const updatedInput = { ...toolInput, command: rewritten };
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } }));
}

function parsePayload(text) {
  try {
    return JSON.parse(text) ?? {};
  } catch {
    return {};
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
