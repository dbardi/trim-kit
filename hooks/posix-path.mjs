// Windows paths with forward slashes work in Git Bash and PowerShell alike.
export function toPosix(path) {
  return path.replaceAll('\\', '/');
}
