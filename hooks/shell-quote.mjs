const SAFE_UNQUOTED = /^[A-Za-z0-9@%+=:,./-]+$/;

export function shellQuote(value) {
  if (SAFE_UNQUOTED.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
