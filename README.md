# claude-trim

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
  search results. Claude Code lists it as `claude-trim:repo-search`.

## What you need

- Claude Code on Windows, macOS or Linux
- Node.js 18 or newer, which is already there if you use tools like `npx`.
  Without Node.js the plugin does nothing and nothing breaks.
- On Windows, Git for Windows, which Claude Code uses to run hooks

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add dbardi/claude-trim
/plugin install claude-trim@claude-trim
```

Then start a new session, or run `/reload-plugins`.

To use the output style, run `/config`, open **Output style**, and choose
**Clear Concise Actionable**. The trimming, the model check and the agent work
without this step.

## What gets trimmed

Package managers, build tools and test runners: `npm`, `pnpm` and `yarn`
install, build, test and lint, `dotnet build`, `test`, `restore`, `publish`
and `pack`, `msbuild`, `jest`, `tsc`, `eslint`, `vitest`, `playwright`,
`gradle`, `mvn`, `pip install`, `cargo`, `go build` and `go test`, and `make`.

It works when the command comes first, after `;`, `&&` or `|`, or on a later
line of a multi-line command.

What survives:

- error, failure, exception and warning lines
- TypeScript errors such as `TS2322`, and cross marks in test output
- `Tests:`, `Suites:` and `Snapshots:` summaries
- the last 25 lines, always

What is dropped: progress bars and spinners, download chatter, blank lines,
passing test lines, and stack frames inside `node_modules`. Short output, up to
60 lines, is never touched.

Every trim ends with a note, so nothing disappears silently:

```
[trim-output: 113 of 138 lines hidden; re-run without the pipe for full output]
```

## What is left alone

- `--help`, `--version`, `-v` and `--list`, because the output is the answer
- `--watch`, `dev`, `serve` and `start`, which never finish
- any command that already redirects its output to a file
- every command, if the filter script is missing

## Uninstall

```
/plugin uninstall claude-trim@claude-trim
/plugin marketplace remove claude-trim
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
rewrite. On PowerShell, which needs Windows PowerShell 5.1 or newer:

```powershell
$o = & { <your command> } 2>&1 | Out-String -Stream; $c = $LASTEXITCODE; if (Test-Path "<filter>") { $o | & "<node>" "<filter>" } else { $o }; exit $(if ($null -eq $c) { 0 } else { $c })
```

Details that matter in both:

- **Neither shell filters in a pipeline.** PowerShell has no `set -o
  pipefail`, so a pipeline would report the filter's exit code and a failed
  build would look successful. Bash runs every stage of a pipeline in a
  subshell, so a pipeline would discard any `cd` the command made, and Claude
  Code's Bash tool carries the working directory between calls.
- **A brace group** captures a multi-line command whole and runs in the current
  shell, which keeps a `cd`. A command that calls `exit` itself ends the shell
  before the filter sees its output.
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

184 tests with no dependencies beyond Node.js. The rewrites also run in a real
Bash and a real Windows PowerShell where those are installed.

| Area | Covers |
| --- | --- |
| Command matching | what gets wrapped, and what is deliberately left alone |
| Rewrite shape | exit-status handling, working-directory preservation, a missing filter, multi-line capture, no shell expansion on Bash, and that neither shell's syntax leaks into the other |
| Hook protocol | the JSON contract with Claude Code, including malformed input |
| Filter behavior | what survives and what is dropped, reading and removing a capture file, ANSI codes, carriage-return overwrites, and output the console codepage cannot encode |
| Model check | which launches are turned back, the rubric in the reason, and the fork exemption |
| Plugin layout | the manifest, marketplace entry, hook registrations, agent and output style |
