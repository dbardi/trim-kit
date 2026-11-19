export function trimmed(raw) {
  const lines = raw.split('\n').map((line) => line.trimEnd());
  return lines.join('\n') + '\n';
}
