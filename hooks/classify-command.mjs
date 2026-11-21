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

// Commands whose output is the point, that never finish, or that already write to a file.
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

// True when the command runs a noisy build, install or test tool whose output is worth trimming.
export function shouldTrim(command) {
  return Boolean(command) && !EXEMPT.test(command) && NOISY.test(command);
}
