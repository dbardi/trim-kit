import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toPosix } from './posix-path.mjs';

const SAFE_UNQUOTED = /^[A-Za-z0-9@%+=:,./-]+$/;

// Captures to a file in the current shell, so a `cd` carries over, and filters it from an EXIT trap.
// The trap runs even when the command calls exit, keeps the shell's exit code, and needs no `$`.
export function rewriteBash(command, filterPath) {
  const capture = shellQuote(toPosix(join(tmpdir(), `trim-kit-${randomUUID().replaceAll('-', '')}.out`)));
  const filter = `${shellQuote(toPosix(process.execPath))} ${shellQuote(toPosix(filterPath))}`;
  return `trap "${filter} < ${capture}; rm -f ${capture}" EXIT\n{\n${command}\n} > ${capture} 2>&1`;
}

export function shellQuote(value) {
  if (SAFE_UNQUOTED.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
