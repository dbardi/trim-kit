const ANY_SUBCOMMAND = [];

// Each tool with the subcommands that make it noisy; an empty list means every invocation is noisy.
const NOISY_TOOLS = new Map([
  ['pnpm', ['install', 'i', 'add', 'update', 'build', 'test', 'lint', 'typecheck']],
  ['npm', ['install', 'ci', 'test', 'run', 'rebuild']],
  ['yarn', ['install', 'add', 'build', 'test', 'lint']],
  ['dotnet', ['build', 'test', 'restore', 'publish', 'pack']],
  ['msbuild', ANY_SUBCOMMAND],
  ['jest', ANY_SUBCOMMAND],
  ['tsc', ANY_SUBCOMMAND],
  ['eslint', ANY_SUBCOMMAND],
  ['vitest', ANY_SUBCOMMAND],
  ['playwright', ANY_SUBCOMMAND],
  ['gradle', ['build', 'test']],
  ['gradlew', ['build', 'test']],
  ['mvn', ['clean', 'install', 'test', 'package']],
  ['pip', ['install']],
  ['pip3', ['install']],
  ['cargo', ['build', 'test']],
  ['go', ['build', 'test']],
  ['make', ANY_SUBCOMMAND],
]);

const RUNNABLE_FROM_A_PATH = new Set(['jest', 'tsc', 'eslint', 'vitest', 'playwright']);
const WINDOWS_EXTENSION = /\.(cmd|exe|bat|ps1)$/i;

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

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '{', '}']);
const QUOTES = new Set(['"', "'"]);

// True when the command runs a noisy build, install or test tool whose output is worth trimming.
export function shouldTrim(command) {
  return Boolean(command) && !EXEMPT.test(command) && splitStatements(command).some(isNoisy);
}

function isNoisy([tool, subcommand]) {
  const subcommands = NOISY_TOOLS.get(toolName(tool));
  if (!subcommands) {
    return false;
  }
  return subcommands === ANY_SUBCOMMAND || subcommands.some((noisy) => isSubcommand(subcommand, noisy));
}

function toolName(token) {
  const name = token.toLowerCase().replace(WINDOWS_EXTENSION, '');
  const base = name.split(/[/\\]/).at(-1);
  return base === name || RUNNABLE_FROM_A_PATH.has(base) ? base : undefined;
}

// A script name such as "test:unit" counts as the "test" subcommand.
function isSubcommand(token = '', noisy) {
  const name = token.toLowerCase();
  return name === noisy || name.startsWith(`${noisy}:`);
}

// Splits on shell separators outside quotes and returns each statement as its list of words.
function splitStatements(command) {
  const splitter = { statements: [[]], word: undefined, quote: undefined };
  [...command].forEach((character, index) => readCharacter(splitter, character, command, index));
  endWord(splitter);
  return splitter.statements.filter((words) => words.length > 0);
}

function readCharacter(splitter, character, command, index) {
  if (splitter.quote) {
    readQuoted(splitter, character);
  } else if (QUOTES.has(character)) {
    splitter.quote = character;
    splitter.word ??= '';
  } else if (SEPARATORS.has(character) && !isRedirectAmpersand(command, index)) {
    endWord(splitter);
    splitter.statements.push([]);
  } else if (/\s/.test(character)) {
    endWord(splitter);
  } else {
    splitter.word = (splitter.word ?? '') + character;
  }
}

function readQuoted(splitter, character) {
  if (character === splitter.quote) {
    splitter.quote = undefined;
  } else {
    splitter.word += character;
  }
}

// The & in 2>&1, >&2 and &> belongs to a redirect, not a statement separator.
function isRedirectAmpersand(command, index) {
  return command[index] === '&' && (command[index - 1] === '>' || command[index + 1] === '>');
}

function endWord(splitter) {
  if (splitter.word !== undefined) {
    splitter.statements.at(-1).push(splitter.word);
    splitter.word = undefined;
  }
}
