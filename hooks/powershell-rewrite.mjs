import { toPosix } from './posix-path.mjs';

// Captures first and re-raises $LASTEXITCODE after the filter, or 1 when no native command ran and one raised an error.
// It keeps to Windows PowerShell 5.1 syntax and shows the raw output when the filter file is missing.
export function rewritePowerShell(command, filterPath) {
  const interpreter = `"${toPosix(process.execPath)}"`;
  const filter = `"${toPosix(filterPath)}"`;
  return '$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; '
    + '$e = if ($Error.Count -gt 0) { $Error[0] }; '
    + `$o = & {\n${command}\n} 2>&1 | Out-String -Stream; `
    + '$c = $LASTEXITCODE; '
    + '$f = $Error.Count -gt 0 -and -not [object]::ReferenceEquals($Error[0], $e); '
    + `if (Test-Path ${filter}) { $o | & ${interpreter} ${filter} } else { $o }; `
    + 'exit $(if ($null -ne $c) { $c } elseif ($f) { 1 } else { 0 })';
}
