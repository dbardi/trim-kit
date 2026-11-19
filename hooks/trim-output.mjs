const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*\x07/g;

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

const KEEP_ALL_UNDER = 60;
const TAIL_LINES = 25;

export function trimmed(raw) {
  const lines = clean(raw);
  if (lines.length <= KEEP_ALL_UNDER) {
    return withNewlines(lines);
  }
  const original = lines.length;
  const withoutPasses = lines.filter((line) => !PASSING.test(line));
  const kept = withoutPasses.slice(-TAIL_LINES);
  const note = `[trim-output: ${original - kept.length} of ${original} lines hidden; re-run without the pipe for full output]`;
  return withNewlines([...kept, note]);
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
