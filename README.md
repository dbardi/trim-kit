# trim-kit

A Claude Code plugin that saves tokens, so your sessions last longer and cost less.

Installs, builds and test runs print thousands of lines and say almost nothing.
Claude reads every one of those lines again on every later turn of the
session, so one noisy test run is paid for over and over. This plugin keeps
only the lines that matter.

Measured on a real monorepo test run:

| | Lines | Bytes | Approx. tokens |
| --- | ---: | ---: | ---: |
| Before | 10,716 | 852,427 | ~213,000 |
| After | 157 | 8,015 | ~2,000 |

The failure list, the root cause and the `Tests:` summary all survived.

## What you get

- **Trimmed command output.** Noisy commands such as `npm install`, `dotnet
  test` or `pnpm build` come back as errors, failures and the final summary.
- **A model on every subagent.** When Claude starts a helper agent without
  choosing a model, the launch is turned back with a short guide, and Claude
  picks one. Small jobs go to a small, cheap model.
- **The Clear Concise Actionable output style.** Short answers, the most
  important information last, no flattery or filler.
- **The `repo-search` agent.** A cheap, read-only helper that finds where
  things are in a codebase, so the main conversation does not fill up with
  search results. Claude Code lists it as `trim-kit:repo-search`.

## What you need

- Claude Code on Windows, macOS or Linux
- Node.js 18 or newer, which is already there if you use tools like `npx`.
  Without Node.js the plugin does nothing and nothing breaks.
- On Windows, Git for Windows, which Claude Code uses to run hooks

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add dbardi/trim-kit
/plugin install trim-kit@trim-kit
```

Then start a new session, or run `/reload-plugins`.

To use the output style, run `/config`, open **Output style**, and choose
**trim-kit:Clear Concise Actionable**. The trimming, the model check and the agent work
without this step.

## What gets trimmed

Package managers, build tools and test runners:

- `pnpm install`, `i`, `add`, `update`, `build`, `test`, `lint`, `typecheck`
  and `run`
- `npm install`, `ci`, `test`, `run` and `rebuild`
- `yarn` on its own, and `yarn install`, `add`, `build`, `test`, `lint` and `run`
- `dotnet build`, `test`, `restore`, `publish` and `pack`, and `msbuild`
- `jest`, `tsc`, `eslint`, `vitest` and `playwright`
- `gradle` and `gradlew` with `build` or `test`, and `mvn clean`, `install`,
  `test` and `package`
- `pip install` and `pip3 install`, `cargo build` and `cargo test`, `go build`
  and `go test`, and `make`

A script name such as `test:unit` counts as its `test` subcommand.

The command is split into statements at `;`, `&&`, `||`, `|`, `&`, new lines,
parentheses and braces, and each statement is judged on its own. Text inside
quotes is never split and never read as a tool, so `git commit -m "fix; make
it work"` is left alone.

Within a statement, these are skipped to find the tool:

- env settings such as `CI=1` or `NODE_ENV=test`
- the launchers `npx`, `bunx`, `pnpm exec`, `pnpm dlx` and `yarn dlx`, with
  their options
- a path, so `./gradlew build` and `node_modules/.bin/jest` count, and a
  Windows `.cmd`, `.exe`, `.bat` or `.ps1` ending

So `cd app && CI=1 npx jest` is trimmed. `time npm test` and `sudo make
install` are not, since `time` and `sudo` are not skipped.

What survives:

- error, failure, exception and warning lines, up to 80 of them
- TypeScript errors such as `TS2322`, and cross marks in test output
- `Tests:`, `Suites:` and `Snapshots:` summaries
- the last 25 lines that are left once the dropped lines below are gone

What is dropped: progress bars and spinners, download chatter, blank lines,
passing test lines such as `PASS` or `✓`, and stack frames inside
`node_modules`. Color codes are stripped too.

Output that is 60 lines or fewer once the dropped lines above, apart from
passing lines, are removed keeps everything else, passing lines included, and
gets no note. Longer output
ends with a note saying how much was hidden:

```
[trim-output: 113 of 138 lines hidden; re-run with its output redirected to a file for full output]
```

A command that redirects its output to a file, such as `pnpm test > test.log`,
is left alone, so that is how you get every line.

## What is left alone

A statement that never finishes leaves the whole command alone, because
trimming waits for the command to end:

- a `dev`, `serve` or `start` script or subcommand of `npm`, `pnpm`, `yarn`,
  `bun`, `next`, `nuxt`, `vite`, `astro`, `ng`, `remix` or `wrangler`, such as
  `npm run dev`, `pnpm start`, `npm run dev:web` or `ng serve`
- `vite` on its own
- any argument starting with `--watch`, such as `--watchAll`

So `pnpm build && pnpm start` runs untrimmed, while `echo start; pnpm test` and
`cd dev && npm test` are trimmed.

A noisy statement is not trimmed when:

- it has `--help`, `-h`, `--version` or `--list` as an argument, or `-v` as its
  only argument, because the output is the answer. `go test -v` is still
  trimmed, since `-v` means verbose there.
- it sends its output to a file with `>`, `>>`, `1>`, `&>` or PowerShell's
  `*>`. `2>&1` and
  `2> errors.log` keep the output on screen, so they are trimmed.

Every command is also left alone if the filter script is missing.

## Uninstall

```
/plugin uninstall trim-kit@trim-kit
/plugin marketplace remove trim-kit
```

## Coming from version 0.2

Version 0.2 was a Python script that you installed with `install.py`. It keeps
running until you remove it, and then trimming would happen twice.

1. Open `~/.claude/settings.json`. On Windows that is
   `%USERPROFILE%\.claude\settings.json`.
2. Under `hooks`, then `PreToolUse`, delete the entry whose command mentions
   `hook-trim.py`.
3. Delete `hook-trim.py` and `trim-output.py` from the `~/.claude` folder.

## For developers

How the rewrite works, so you can change it with confidence. The hook returns a
new command through `hookSpecificOutput.updatedInput`. On Bash:

```bash
exec 8>&1 9>&2
trap "<node> <filter> < <capture> >&8 2>&9; rm -f <capture>" EXIT
{
<your command>
} > <capture> 2>&1
```

`<capture>` is a file in the system temp directory with a fresh name for every
rewrite. On PowerShell, which needs Windows PowerShell 5.1 or newer, written
here on separate lines for reading:

```powershell
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$e = if ($Error.Count -gt 0) { $Error[0] }
$o = & {
<your command>
} 2>&1 | Out-String -Stream
$c = $LASTEXITCODE
$f = $Error.Count -gt 0 -and -not [object]::ReferenceEquals($Error[0], $e)
if (Test-Path "<filter>") { $o | & "<node>" "<filter>" } else { $o }
exit $(if ($null -ne $c) { $c } elseif ($f) { 1 } else { 0 })
```

Details that matter in both:

- **The command runs to completion before the filter starts.** PowerShell has
  no `set -o pipefail`, so the outcome comes from a captured run of the command.
- **Both shells exit with the command's own exit code.** On Bash the filter
  runs from the EXIT trap, and an EXIT trap keeps the shell's exit status.
  On PowerShell, when no native command ran, it exits 1 if the command raised an
  error, and 0 otherwise.
- **The command sits on its own lines** inside the group, so a trailing `#`
  comment cannot swallow the closing brace. The group runs in the current shell,
  which keeps a `cd`, and Claude Code's Bash tool carries the working directory
  between calls.
- **On Bash, a command that calls `exit` still shows its output**, because the
  trap runs whenever the shell ends. `exec 8>&1 9>&2` keeps the screen on
  descriptors 8 and 9, so the filter writes there even when a function exits
  while the capture redirect is still open. The trap also deletes the capture
  file.
- **The Bash rewrite asks the shell to expand nothing.** Claude Code asks
  before running a command it cannot analyze, and `$(mktemp)` or `$?` is exactly
  that. The trap body sits in double quotes, so the hook leaves a command
  unwrapped when the node, filter or capture path holds `"`, `$` or a backtick.
- **A Bash statement that starts with `trap` or `exec` leaves the command
  unwrapped.** Bash keeps one EXIT trap, so the command's would replace the
  filter, and `exec` replaces the shell before the trap can run. The same words
  elsewhere, such as `echo trap`, are fine. A node or filter path with a single
  quote leaves the command unwrapped too, since its quoting adds a `"`.
- **PowerShell passes UTF-8 to the filter.** Windows PowerShell 5.1 encodes
  what it pipes to a program as ASCII, which turns cross marks into `?`.
- **The filter reads only standard input** and writes the trimmed output.
  Each shell's rewrite owns capture, cleanup and exit status.
- **The interpreter is the Node.js that is running the hook**, as an absolute
  path, and the filter path is resolved beside the hook.
- **The filter is checked before rewriting.** If it is missing, the command
  runs as it was.

Adding a build tool is one entry in the `NOISY_TOOLS` map in
`hooks/classify-command.mjs`, which pairs each tool with its noisy subcommands.
The thresholds are at the top of `hooks/trim-output.mjs`:

| Constant | Default | Meaning |
| --- | ---: | --- |
| `KEEP_ALL_UNDER` | 60 | at or below this many lines after cleanup, pass the rest through |
| `TAIL_LINES` | 25 | trailing lines always kept |
| `MAX_SIGNAL` | 80 | cap on promoted error lines |

### Layout

| Path | What it is |
| --- | --- |
| `.claude-plugin/plugin.json` | the plugin's name, version and description |
| `.claude-plugin/marketplace.json` | lets `/plugin marketplace add` find the plugin |
| `hooks/hooks.json` | registers the two hooks, each skipped when Node.js is missing |
| `hooks/trim-command.mjs` | rewrites noisy commands |
| `hooks/classify-command.mjs` | decides whether a command gets trimmed |
| `hooks/split-statements.mjs` | splits a command into statements outside quotes |
| `hooks/trim-output.mjs` | filters the output |
| `hooks/bash-rewrite.mjs` | wraps a command for Bash |
| `hooks/powershell-rewrite.mjs` | wraps a command for PowerShell |
| `hooks/posix-path.mjs` | turns Windows paths into forward-slash paths for both shells |
| `hooks/require-subagent-model.mjs` | turns back a subagent launch with no model |
| `agents/repo-search.md` | the `repo-search` agent |
| `output-styles/clear-concise-actionable.md` | the output style |

### Tests

```
node --test
```

The tests need nothing beyond Node.js. The rewrites also run in a real Bash and
a real Windows PowerShell where those are installed.

| Area | Covers |
| --- | --- |
| Command matching | a table of commands and whether each is trimmed: statements, quotes, skipped prefixes, exemptions and redirects |
| Shell rewrites | one behavior suite run in each installed shell (success, failure output, exact exit codes, trimmed long output), plus each shell's own cases: a `cd` carrying over, an `exit` inside the command, capture-file cleanup, commands Bash declines, no shell expansion on Bash, and that neither shell's syntax leaks into the other |
| Hook protocol | the JSON contract with Claude Code, including malformed input |
| Filter behavior | what survives and what is dropped, reading only standard input, ANSI codes, carriage-return overwrites, and output the console codepage cannot encode |
| Model check | which launches are turned back, the rubric in the reason, and the fork exemption |
| Plugin layout | the manifest, marketplace entry, hook registrations, agent and output style |
