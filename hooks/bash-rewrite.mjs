import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toPosix } from './posix-path.mjs';
import { splitStatements } from './split-statements.mjs';

const SAFE_UNQUOTED = /^[A-Za-z0-9@%+=:,./-]+$/;
const SPECIAL_IN_DOUBLE_QUOTES = /["$`]/;
const ENV_SETTING = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DEFEATS_THE_TRAP = new Set(['trap', 'exec']);
const SAVE_SCREEN = 'exec 8>&1 9>&2';
const TO_SCREEN = '>&8 2>&9';

// Captures to a file in the current shell, so a `cd` carries over, and filters it from an EXIT trap.
// The trap runs even when the command calls exit, keeps the shell's exit code, and needs no `$`.
export function rewriteBash(command, filterPath) {
  if (defeatsTheTrap(command)) {
    return undefined;
  }
  const capture = shellQuote(toPosix(join(tmpdir(), `trim-kit-${randomUUID().replaceAll('-', '')}.out`)));
  const filter = `${shellQuote(toPosix(process.execPath))} ${shellQuote(toPosix(filterPath))}`;
  const trapBody = `${filter} < ${capture} ${TO_SCREEN}; rm -f ${capture}`;
  if (SPECIAL_IN_DOUBLE_QUOTES.test(trapBody)) {
    return undefined;
  }
  return `${SAVE_SCREEN}\ntrap "${trapBody}" EXIT\n{\n${command}\n} > ${capture} 2>&1`;
}

// A statement that sets its own trap replaces the filter, and exec replaces the shell before the trap runs.
function defeatsTheTrap(command) {
  return splitStatements(command).some((words) => DEFEATS_THE_TRAP.has(words.find((word) => !ENV_SETTING.test(word))));
}

export function shellQuote(value) {
  if (SAFE_UNQUOTED.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
