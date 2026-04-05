import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SystemProcess {
  pid: number;
  cwd: string;
  sessionId?: string;
  startedAt?: number;
  kind?: string;
}

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

export function scanClaudeProcesses(): SystemProcess[] {
  try {
    const ps = execSync('ps aux', { encoding: 'utf8' });
    const lines = ps.split('\n');
    const results: SystemProcess[] = [];
    const serverPid = process.pid;

    // Get PIDs of all processes inside claude-control tmux sessions
    let ccTmuxPids = new Set<number>();
    try {
      const tmuxSessions = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null', { encoding: 'utf8' });
      for (const name of tmuxSessions.trim().split('\n')) {
        if (!name.startsWith('cc-')) continue;
        try {
          const panes = execSync(`tmux list-panes -t ${name} -F "#{pane_pid}" 2>/dev/null`, { encoding: 'utf8' });
          for (const pid of panes.trim().split('\n')) {
            const n = parseInt(pid, 10);
            if (!isNaN(n)) ccTmuxPids.add(n);
          }
        } catch {}
      }
    } catch {}

    for (const line of lines) {
      if (!line.includes('claude')) continue;
      if (line.includes('claude-control') || line.includes('ts-node') || line.includes('grep')) continue;
      if (line.includes('Claude.app') || line.includes('chrome-native')) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      if (isNaN(pid) || pid === serverPid) continue;

      const args = parts.slice(10).join(' ');

      // Must be the claude CLI binary
      if (!args.includes('/claude') && !args.startsWith('claude')) continue;
      // Skip tmux-related processes
      if (args.includes('tmux')) continue;
      // Skip processes running inside claude-control tmux sessions
      if (ccTmuxPids.has(pid)) continue;

      // Read session file
      let cwd = '';
      let sessionId: string | undefined;
      let startedAt: number | undefined;
      let kind: string | undefined;

      const sessionFile = path.join(SESSIONS_DIR, `${pid}.json`);
      try {
        if (fs.existsSync(sessionFile)) {
          const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
          cwd = data.cwd ?? '';
          sessionId = data.sessionId;
          startedAt = data.startedAt;
          kind = data.kind;
        }
      } catch {}

      if (!cwd) {
        try {
          const lsof = execSync(`lsof -p ${pid} -Fn 2>/dev/null`, { encoding: 'utf8' });
          const cwdLine = lsof.split('\n').find(l => l.startsWith('n/'));
          if (cwdLine) cwd = cwdLine.slice(1);
        } catch {}
      }

      results.push({ pid, cwd, sessionId, startedAt, kind });
    }

    return results;
  } catch {
    return [];
  }
}
