import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FILTER = fileURLToPath(new URL('../../hooks/trim-output.mjs', import.meta.url));
export const BASH_CAPTURE = /\}\s*>\s*('[^']*'|\S+)\s*2>&1/;

export const bashIsAvailable = spawnSync('bash', ['--version']).status === 0;
export const powershellIsAvailable = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0']).status === 0;

export function runBash(script) {
  return spawnSync('bash', ['-c', script], { encoding: 'utf8' });
}

export function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' });
}
