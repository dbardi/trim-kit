// PreToolUse hook for Agent: denies a subagent launch that names no model, so each one is sized to its task.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A fork always inherits the parent model and ignores the model parameter.
const INHERITS_PARENT_MODEL = 'fork';

const BLOCK_REASON = 'Subagent launched without a model. Pick the cheapest model that can do the job, '
  + 'then pass it as the model parameter. '
  + 'haiku: lookups, file and symbol searches, summaries. '
  + 'sonnet: routine implementation against a clear spec, tests, straightforward reviews. '
  + 'opus: design, security, hard debugging, anything costly if wrong.';

export function blockReasonFor(toolInput) {
  if (toolInput?.subagent_type === INHERITS_PARENT_MODEL || toolInput?.model?.trim()) {
    return undefined;
  }
  return BLOCK_REASON;
}

function denial(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

function parsePayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function main() {
  const payload = parsePayload(readFileSync(0, 'utf8'));
  const reason = payload && blockReasonFor(payload.tool_input);
  if (reason) {
    process.stdout.write(JSON.stringify(denial(reason)));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
