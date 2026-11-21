import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toPosix } from './posix-path.mjs';

const SAFE_UNQUOTED = /^[A-Za-z0-9@%+=:,./-]+$/;

// Captures to a file and then filters it, so the command runs in the current shell and keeps any
// `cd`. It uses no shell expansion, so Claude Code can analyze it statically and asks nothing extra.
export function rewriteBash(command, filterPath) {
  const capture = shellQuote(toPosix(join(tmpdir(), `trim-kit-${randomUUID().replaceAll('-', '')}.out`)));
  const runFilter = `${shellQuote(toPosix(process.execPath))} ${shellQuote(toPosix(filterPath))} ${capture}`;
  return `{\n${command}\n} > ${capture} 2>&1 && ${runFilter} ok || ${runFilter} failed`;
}

export function shellQuote(value) {
  if (SAFE_UNQUOTED.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
