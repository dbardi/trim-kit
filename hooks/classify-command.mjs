const ANY_SUBCOMMAND = [];
const NO_SUBCOMMAND = '';

// Each tool with the subcommands that make it noisy; an empty list means every invocation is noisy.
const NOISY_TOOLS = new Map([
  ['pnpm', ['install', 'i', 'add', 'update', 'build', 'test', 'lint', 'typecheck', 'run']],
  ['npm', ['install', 'ci', 'test', 'run', 'rebuild']],
  ['yarn', [NO_SUBCOMMAND, 'install', 'add', 'build', 'test', 'lint', 'run']],
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

const ANSWER_FLAGS = new Set(['--help', '-h', '--version', '--list']);
const VERSION_OR_VERBOSE = '-v';
const SERVER_SCRIPT = /^(dev|serve|start)(:|$)/i;
const WATCH_FLAG = '--watch';
const CHANGES_FOLDER = new Set(['cd', 'pushd', 'set-location', 'sl', 'chdir']);
const STDOUT_TO_FILE = /^(1?>>?|&>>?)(?!&)/;

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '{', '}']);
const QUOTES = new Set(['"', "'"]);

// True when the command runs a noisy build, install or test tool whose output is worth trimming.
export function shouldTrim(command) {
  if (!command) {
    return false;
  }
  const invocations = splitStatements(command).map(toolInvocation);
  return !invocations.some(neverFinishes) && invocations.some(isTrimmable);
}

// A server or watch mode keeps running, so wrapping it would hide its output until it exits.
function neverFinishes([tool = '', ...args]) {
  if (CHANGES_FOLDER.has(tool.toLowerCase())) {
    return false;
  }
  const script = args[0]?.toLowerCase() === 'run' ? args[1] : args[0];
  return SERVER_SCRIPT.test(script ?? '') || args.some((arg) => arg.startsWith(WATCH_FLAG));
}

function isTrimmable(invocation) {
  return isNoisy(invocation) && !answersItself(invocation) && !writesToFile(invocation);
}

// Help, version and list output is short and is the answer, and -v means verbose to go and dotnet unless it stands alone.
function answersItself([, ...args]) {
  return args.some((arg) => ANSWER_FLAGS.has(arg)) || (args.length === 1 && args[0] === VERSION_OR_VERBOSE);
}

function writesToFile(invocation) {
  return invocation.some((word) => STDOUT_TO_FILE.test(word));
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
