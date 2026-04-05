// Detect Claude Code permission prompts from raw terminal output.
// We strip ANSI codes and look for the characteristic patterns.

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;

export interface PermissionRequest {
  tool: string;
  detail: string;
  timestamp: number;
}

// Claude Code permission blocks look like:
//   "--- Tool: Bash ---"  or  "--- Bash ---"
//   details...
//   "Allow? (Y/n)" or "Allow tool? [Y/n/e]" or similar
const TOOL_HEADER_RE = /(?:^|\n)\s*[-─╭┌].*?(Bash|Read|Write|Edit|Glob|Grep|WebFetch|WebSearch|Agent|Skill|NotebookEdit|TaskCreate|LSP)[^\n]*/i;
const ALLOW_RE = /(?:allow|approve|permit|\[Y\/n|y\/n|\(Y\)es)/i;

export function detectPermission(rawChunk: string, recentBuffer: string): PermissionRequest | null {
  // Combine recent buffer with new chunk for context
  const combined = (recentBuffer + rawChunk).slice(-2000);
  const clean = combined.replace(ANSI_RE, '');

  // Must have an "allow" prompt
  if (!ALLOW_RE.test(clean)) return null;

  // Find the tool being requested
  const toolMatch = clean.match(TOOL_HEADER_RE);
  if (!toolMatch) return null;

  const tool = toolMatch[1];

  // Extract detail - lines between tool header and allow prompt
  const headerIdx = clean.indexOf(toolMatch[0]);
  const allowIdx = clean.search(ALLOW_RE);
  if (headerIdx < 0 || allowIdx < 0) return null;

  const detail = clean
    .slice(headerIdx + toolMatch[0].length, allowIdx)
    .trim()
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 5) // keep it short
    .join('\n');

  return { tool, detail, timestamp: Date.now() };
}
