import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteBash } from './bash-rewrite.mjs';
import { shouldTrim } from './classify-command.mjs';
import { rewritePowerShell } from './powershell-rewrite.mjs';

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
