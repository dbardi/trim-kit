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

const LAUNCHERS = ['npx', 'bunx', 'pnpm exec', 'pnpm dlx', 'yarn dlx'].map((launcher) => launcher.split(' '));
const ENV_SETTING = /^[A-Za-z_][A-Za-z0-9_]*=/;
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
  return Boolean(command) && !EXEMPT.test(command) && splitStatements(command).map(toolInvocation).some(isNoisy);
}

// The words from the tool onward, past any env settings and a launcher such as npx and its options.
function toolInvocation(words) {
  const afterSettings = words.slice(countWhile(words, (word) => ENV_SETTING.test(word)));
  const launcher = LAUNCHERS.find((parts) => parts.every((part, index) => afterSettings[index]?.toLowerCase() === part));
  if (!launcher) {
    return afterSettings;
  }
  const afterLauncher = afterSettings.slice(launcher.length);
  return afterLauncher.slice(countWhile(afterLauncher, (word) => word.startsWith('-')));
}

function countWhile(words, predicate) {
  const index = words.findIndex((word) => !predicate(word));
  return index === -1 ? words.length : index;
}

function isNoisy([tool = '', subcommand]) {
  const subcommands = NOISY_TOOLS.get(toolName(tool));
  if (!subcommands) {
    return false;
  }
  return subcommands === ANY_SUBCOMMAND || subcommands.some((noisy) => isSubcommand(subcommand, noisy));
}

function toolName(token) {
  return token.toLowerCase().replace(WINDOWS_EXTENSION, '').split(/[/\\]/).at(-1);
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
