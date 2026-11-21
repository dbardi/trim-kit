import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldTrim } from './classify-command.mjs';
import { shellQuote } from './shell-quote.mjs';

const FILTER_NAME = 'trim-output.mjs';
const FILTER = resolve(dirname(fileURLToPath(import.meta.url)), FILTER_NAME);

const REWRITERS = new Map([
  ['Bash', rewriteBash],
  ['PowerShell', rewritePowerShell],
]);

export function decide(command, toolName, filterPath = FILTER) {
  const rewrite = REWRITERS.get(toolName);
  if (!rewrite || !command || command.includes(FILTER_NAME) || !shouldTrim(command)) {
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
// With no native exit code it exits 1 when the command raised an error. Only Windows PowerShell 5.1 syntax is used,
// and the raw output shows when the filter file is missing.
export function rewritePowerShell(command, filterPath = FILTER) {
  const interpreter = `"${toPosix(process.execPath)}"`;
  const filter = `"${toPosix(filterPath)}"`;
  return '$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; '
    + '$e = if ($Error.Count -gt 0) { $Error[0] }; '
    + `$o = & {\n${command}\n} 2>&1 | Out-String -Stream; `
    + '$c = $LASTEXITCODE; '
    + '$f = $Error.Count -gt 0 -and -not [object]::ReferenceEquals($Error[0], $e); '
    + `if (Test-Path ${filter}) { $o | & ${interpreter} ${filter} } else { $o }; `
    + 'exit $(if ($null -ne $c) { $c } elseif ($f) { 1 } else { 0 })';
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
    // A hook must never break the session, so unreadable input means no rewrite.
    return {};
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
