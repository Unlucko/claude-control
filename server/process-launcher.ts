import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export interface LaunchOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface SpawnSpec {
  spawnFile: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  name: string;
  tmuxSession?: string;
}

const DEFAULT_CWD = os.homedir();

function resolveCwd(cwd?: string): string {
  if (!cwd) return DEFAULT_CWD;
  return cwd.startsWith('~') ? path.join(os.homedir(), cwd.slice(1)) : cwd;
}

function claudeBin(): string {
  try {
    return execSync('which claude', { encoding: 'utf8' }).trim();
  } catch {
    return '/usr/local/bin/claude';
  }
}

function tmuxBin(): string {
  try {
    return execSync('which tmux', { encoding: 'utf8' }).trim();
  } catch {
    return 'tmux';
  }
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export const AGENT_PRESETS: Record<string, { description: string; extraArgs: string[] }> = {
  default: {
    description: 'Claude interactivo estandar',
    extraArgs: [],
  },
  reviewer: {
    description: 'Revisor de codigo -- modo plan, sin cambios automaticos',
    extraArgs: ['--permission-mode', 'plan'],
  },
  'db-analyst': {
    description: 'Analista de PostgreSQL/Azure',
    extraArgs: [
      '--append-system-prompt',
      'You are analyzing a PostgreSQL database on Azure (Callpilot production). Focus on query performance, index usage, Azure-specific considerations, and data integrity. Never modify data unless explicitly asked.',
    ],
  },
  autonomous: {
    description: 'Agente autonomo sin confirmaciones (cuidado)',
    extraArgs: ['--dangerously-skip-permissions'],
  },
};

// ─── Launchers ───────────────────────────────────────────────────────────────

export function launchClaude(opts: LaunchOptions & {
  agent?: string;
  resumeSessionId?: string;
  name?: string;
}): SpawnSpec {
  const bin = claudeBin();
  const cwd = resolveCwd(opts.cwd);
  const preset = AGENT_PRESETS[opts.agent ?? 'default'] ?? AGENT_PRESETS.default;

  const claudeArgs: string[] = [...preset.extraArgs];
  if (opts.resumeSessionId) {
    claudeArgs.push('--resume', opts.resumeSessionId);
  }

  const tmuxName = `cc-${randomUUID().slice(0, 8)}`;
  const cols = opts.cols ?? 80;
  const rows = opts.rows ?? 24;

  // Build the full claude command, quoting args that contain spaces
  const claudeCmd = [bin, ...claudeArgs].map(a => a.includes(' ') ? `"${a}"` : a).join(' ');

  // Create detached tmux session running claude (no status bar, no escape passthrough issues)
  const tmux = tmuxBin();
  execSync(`${tmux} new-session -d -s ${tmuxName} -x ${cols} -y ${rows} -c ${JSON.stringify(cwd)} ${JSON.stringify(claudeCmd)}`, {
    cwd,
    env: { ...process.env } as Record<string, string>,
  });
  // Hide tmux status bar and set terminal type
  try {
    execSync(`${tmux} set-option -t ${tmuxName} status off`);
    execSync(`${tmux} set-option -t ${tmuxName} default-terminal "xterm-256color"`);
  } catch {}

  const name = opts.name ?? (opts.agent ? `claude:${opts.agent}` : 'claude');

  return {
    spawnFile: tmux,
    args: ['attach-session', '-t', tmuxName],
    env: {},
    cwd,
    name,
    tmuxSession: tmuxName,
  };
}

export function launchTerminal(opts: LaunchOptions & { name?: string }): SpawnSpec {
  const cwd = resolveCwd(opts.cwd);
  const tmuxName = `cc-${randomUUID().slice(0, 8)}`;
  const cols = opts.cols ?? 80;
  const rows = opts.rows ?? 24;
  const tmux = tmuxBin();

  execSync(`${tmux} new-session -d -s ${tmuxName} -x ${cols} -y ${rows} -c ${JSON.stringify(cwd)} /bin/zsh`, {
    cwd,
    env: { ...process.env } as Record<string, string>,
  });
  try {
    execSync(`${tmux} set-option -t ${tmuxName} status off`);
    execSync(`${tmux} set-option -t ${tmuxName} default-terminal "xterm-256color"`);
  } catch {}

  return {
    spawnFile: tmux,
    args: ['attach-session', '-t', tmuxName],
    env: {},
    cwd,
    name: opts.name ?? 'terminal',
    tmuxSession: tmuxName,
  };
}

export function getAgentPresets(): Array<{ id: string; description: string }> {
  return Object.entries(AGENT_PRESETS).map(([id, p]) => ({
    id,
    description: p.description,
  }));
}
