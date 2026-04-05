import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

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
    // fallback common locations
    return '/usr/local/bin/claude';
  }
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export const AGENT_PRESETS: Record<string, { description: string; extraArgs: string[] }> = {
  default: {
    description: 'Claude interactivo estándar',
    extraArgs: [],
  },
  reviewer: {
    description: 'Revisor de código — modo plan, sin cambios automáticos',
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
    description: 'Agente autónomo sin confirmaciones (cuidado)',
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

  const args: string[] = [...preset.extraArgs];

  if (opts.resumeSessionId) {
    args.push('--resume', opts.resumeSessionId);
  }

  const name = opts.name
    ?? (opts.agent ? `claude:${opts.agent}` : 'claude');

  return {
    spawnFile: bin,
    args,
    env: {},
    cwd,
    name,
  };
}

export function launchTerminal(opts: LaunchOptions & { name?: string }): SpawnSpec {
  const cwd = resolveCwd(opts.cwd);
  return {
    spawnFile: '/bin/zsh',
    args: ['--login'],
    env: {},
    cwd,
    name: opts.name ?? 'terminal',
  };
}

export function getAgentPresets(): Array<{ id: string; description: string }> {
  return Object.entries(AGENT_PRESETS).map(([id, p]) => ({
    id,
    description: p.description,
  }));
}
