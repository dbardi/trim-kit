import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ANSI =/\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*\x07/g;

const NOISE = new RegExp([
  String.raw`^\s*Progress:\s*resolved\s`, // pnpm resolver ticker
  String.raw`^\s*Packages:\s*[-+]\d`,
  String.raw`^\s*(Downloading|Fetching|Extracting|Resolving|Linking|Unpacking)\b`,
  String.raw`^\s*(added|removed|changed)\s+\d+\s+packages?\b`,
  String.raw`^\s*\[?\d{1,3}%\]?\s`, // bare percentage ticks
  '[─-╿▀-▟]{4,}', // box and block progress bars
  '[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]', // braille spinner
  String.raw`^\s*at\s.*\bnode_modules[/\\]`, // library stack frames
  String.raw`^\s*$`,
].join('|'));

const PASSING = new RegExp([
  String.raw`^\s*PASS\b`,
  String.raw`^\s*[✓✔]`,
  String.raw`^\s*ok\s+\d+`,
  String.raw`^\s*Done\s+in\s`,
].join('|'));

const SIGNAL = new RegExp([
  String.raw`\berror\b`,
  String.raw`\bERR!`,
  String.raw`\bfail(ed|ure|s)?\b`,
  String.raw`\bexception\b`,
  String.raw`\btraceback\b`,
  String.raw`\bwarn(ing)?\b`,
  String.raw`\bcannot\b`,
  String.raw`\bnot\s+found\b`,
  String.raw`\bundefined\b`,
  String.raw`\bENOENT\b`,
  String.raw`\bELIFECYCLE\b`,
  String.raw`\bEADDRINUSE\b`,
  String.raw`\bTS\d{3,}\b`, // TypeScript diagnostics
  String.raw`^\s*[-+]?\s*(Expected|Received|Difference)\b`,
  String.raw`^\s*●`, // jest failure bullet
  '[✕✗✘×❌]', // cross marks
  String.raw`\bTests?:\s`,
  String.raw`\bSuites?:\s`,
  String.raw`\bSnapshots:\s`,
].join('|'), 'i');

const KEEP_ALL_UNDER = 60;
const TAIL_LINES = 25;
const MAX_SIGNAL = 80;

export function trimmed(raw) {
  const lines = clean(raw);
  if (lines.length <= KEEP_ALL_UNDER) {
    return withNewlines(lines);
  }
  const withoutPasses = lines.filter((line) => !PASSING.test(line));
  const tailFrom = Math.max(0, withoutPasses.length - TAIL_LINES);
  const signal = promotedIndexes(withoutPasses, tailFrom);
  const kept = [...signal.kept, ...indexesFrom(tailFrom, withoutPasses.length)];
  const body = withGapMarkers(withoutPasses, kept);
  const note = hiddenNote(lines.length - kept.length, lines.length, signal.capped);
  return withNewlines([...body, note]);
}

function promotedIndexes(lines, tailFrom) {
  const matches = indexesFrom(0, tailFrom).filter((i) => SIGNAL.test(lines[i]));
  return { kept: matches.slice(0, MAX_SIGNAL), capped: Math.max(0, matches.length - MAX_SIGNAL) };
}

function indexesFrom(start, end) {
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
}

function withGapMarkers(lines, keptIndexes) {
  const result = [];
  keptIndexes.forEach((index, position) => {
    const gap = position === 0 ? 0 : index - keptIndexes[position - 1] - 1;
    if (gap > 0) {
      result.push(`    ... ${gap} lines omitted ...`);
    }
    result.push(lines[index]);
  });
  return result;
}

function hiddenNote(hidden, original, capped) {
  const cappedNote = capped ? `; ${capped} further matches capped` : '';
  return `[trim-output: ${hidden} of ${original} lines hidden${cappedNote}; re-run without the pipe for full output]`;
}

function withNewlines(lines) {
  return lines.map((line) => `${line}\n`).join('');
}

// Splits on "\n" only, so a carriage-return overwrite stays one line.
function clean(raw) {
  return raw
    .split('\n')
    .map((line) => line.replace(ANSI, '').trimEnd().split('\r').at(-1))
    .filter((line) => !NOISE.test(line));
}

// Filters stdin, or the capture file named by `[path, "ok" | "failed"]`, which it deletes.
export function main(args) {
  if (args.length === 0) {
    process.stdout.write(trimmed(readFileSync(0, 'utf8')));
    return;
  }
  const [capturePath, outcome] = args;
  const raw = readFileSync(capturePath, 'utf8');
  unlinkSync(capturePath);
  process.stdout.write(trimmed(raw));
  if (outcome !== 'ok') {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
