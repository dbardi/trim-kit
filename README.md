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

- `pnpm install`, `i`, `add`, `update`, `build`, `test`, `lint` and `typecheck`
- `npm install`, `ci`, `test`, `run` and `rebuild`
- `yarn install`, `add`, `build`, `test` and `lint`
- `dotnet build`, `test`, `restore`, `publish` and `pack`, and `msbuild`
- `jest`, `tsc`, `eslint`, `vitest` and `playwright`, by name or by a path such
  as `node_modules/.bin/jest`
- `gradle` and `gradlew` with `build` or `test`, and `mvn clean`, `install`,
  `test` and `package`
- `pip install` and `pip3 install`, `cargo build` and `cargo test`, `go build`
  and `go test`, and `make`

The tool name has to start the command, start a line of a multi-line command,
or follow `;`, `&` or `|`. So `cd app && pnpm test` is trimmed, while anything
in front of the tool name stops the match: `npx jest`, `./gradlew build`,
`CI=1 npm test`, `time npm test` and `sudo make install` run untrimmed. So do
`pnpm run build` and a bare `yarn`.

What survives:

- error, failure, exception and warning lines, up to 80 of them
- TypeScript errors such as `TS2322`, and cross marks in test output
- `Tests:`, `Suites:` and `Snapshots:` summaries
- the last 25 lines that are left once the dropped lines below are gone

What is dropped: progress bars and spinners, download chatter, blank lines,
passing test lines such as `PASS` or `✓`, and stack frames inside
`node_modules`. Color codes are stripped too.

Output that is 60 lines or fewer once blank, progress and download lines are
removed is kept whole, passing lines included, and gets no note. Longer output
ends with a note saying how much was hidden:

```
[trim-output: 113 of 138 lines hidden; re-run with its output redirected to a file for full output]
```

A command that redirects its output to a file, such as `pnpm test > test.log`,
is left alone, so that is how you get every line.

## What is left alone

A command is run as it was when any of these appears anywhere in it:

- `--help`, `-h`, `--version`, `-v` or `--list`, because the output is the answer
- `--watch`, or the word `dev`, `serve` or `start`, for commands that never finish
- `>` followed by anything, for output already going to a file

These checks look at the whole command text, so they catch more than they aim
at: `go test -v`, `npm install --save-dev`, a path such as `~/dev/app`, and
`2>&1` all leave the command untrimmed.

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
{
<your command>
} > <capture> 2>&1 && <node> <filter> <capture> ok || <node> <filter> <capture> failed
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
  no `set -o pipefail`, so capturing first is what lets the outcome come from
  the command rather than the filter. On Bash only success or failure carries
  over: the rewrite exits 0 when the command succeeded and 1 when it failed,
  whatever code the command returned.
- **The command sits on its own lines** inside the group, so a trailing `#`
  comment cannot swallow the closing brace. The group runs in the current shell,
  which keeps a `cd`, and Claude Code's Bash tool carries the working directory
  between calls. A command that calls `exit` itself ends the shell before the
  filter sees its output.
- **PowerShell passes UTF-8 to the filter.** Windows PowerShell 5.1 encodes
  what it pipes to a program as ASCII, which turns cross marks into `?`.
- **PowerShell exits with the command's native exit code.** When no native
  command ran, it exits 1 if the command raised an error, and 0 otherwise.
- **The Bash rewrite asks the shell to expand nothing.** Claude Code asks
  before running a command it cannot analyze, and `$(mktemp)` or `$?` is exactly
  that. The hook names the capture file, the filter learns the outcome from
  which side of `&& ||` runs it, and the filter deletes the file and exits 1 on
  `failed`.
- **The filter is called as a plain command**, so an allow rule can match it.
- **The interpreter is the Node.js that is running the hook**, as an absolute
  path, and the filter path is resolved beside the hook.
- **The filter is checked before rewriting.** If it is missing, the command
  runs as it was.

Adding a build tool is one line in the `NOISY` list in `hooks/trim-command.mjs`.
The thresholds are at the top of `hooks/trim-output.mjs`:

| Constant | Default | Meaning |
| --- | ---: | --- |
| `KEEP_ALL_UNDER` | 60 | below this many lines, pass everything through |
| `TAIL_LINES` | 25 | trailing lines always kept |
| `MAX_SIGNAL` | 80 | cap on promoted error lines |

### Layout

| Path | What it is |
| --- | --- |
| `.claude-plugin/plugin.json` | the plugin's name, version and description |
| `.claude-plugin/marketplace.json` | lets `/plugin marketplace add` find the plugin |
| `hooks/hooks.json` | registers the two hooks, each skipped when Node.js is missing |
| `hooks/trim-command.mjs` | rewrites noisy commands |
| `hooks/trim-output.mjs` | filters the output |
| `hooks/shell-quote.mjs` | quotes arguments for the Bash rewrite |
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
| Command matching | what gets wrapped, and what is deliberately left alone |
| Rewrite shape | exit-status handling, working-directory preservation, a missing filter, multi-line capture, no shell expansion on Bash, and that neither shell's syntax leaks into the other |
| Hook protocol | the JSON contract with Claude Code, including malformed input |
| Filter behavior | what survives and what is dropped, reading and removing a capture file, ANSI codes, carriage-return overwrites, and output the console codepage cannot encode |
| Model check | which launches are turned back, the rubric in the reason, and the fork exemption |
| Plugin layout | the manifest, marketplace entry, hook registrations, agent and output style |
