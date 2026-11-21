# Glossary

**Statement**: one part of a command between separators (`;`, `&&`, `||`, `|`,
`&`, a new line, parentheses or braces), with quoted text kept whole. Each one is
judged on its own.

**Noisy command**: a statement that runs a build, install or test tool listed in
`NOISY_TOOLS`, with one of its noisy subcommands, once env settings, launchers
and paths are skipped. A command with at least one is trimmed.

**Exemption**: a reason a noisy statement is left alone: it answers itself
(`--help`, `--version`, `--list`, a lone `-v`) or writes its output to a file.

**Never-finishing command**: a statement that runs a server or watch mode, such
as `pnpm dev` or `jest --watch`. One anywhere in a command leaves the whole
command alone, since trimming waits for it to end.

**File redirect**: `>`, `>>`, `1>` or `&>` sending a statement's output to a
file. `2>&1` and `2> file` are not, because the output still reaches the screen.
