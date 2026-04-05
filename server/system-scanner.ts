import { execSync } from 'child_process';

export interface SystemProcess {
  pid: number;
  cwd: string;
  args: string;
  sessionId?: string;
}

export function scanClaudeProcesses(): SystemProcess[] {
  try {
    const ps = execSync('ps aux', { encoding: 'utf8' });
    const lines = ps.split('\n');
    const results: SystemProcess[] = [];

    for (const line of lines) {
      // Match claude processes but not node/ts-node running claude-control
      if (!line.includes('claude') || line.includes('claude-control') || line.includes('ts-node') || line.includes('grep')) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      if (isNaN(pid)) continue;

      const args = parts.slice(10).join(' ');

      // Skip if it's not actually the claude CLI
      if (!args.includes('/claude') && !args.startsWith('claude')) continue;

      let cwd = '';
      try {
        const lsof = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^ncwd' || lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`, { encoding: 'utf8' });
        cwd = lsof.replace(/^n/, '').trim();
      } catch {}

      if (!cwd) {
        try {
          cwd = execSync(`pwdx ${pid} 2>/dev/null || echo ""`, { encoding: 'utf8' }).split(':')[1]?.trim() ?? '';
        } catch {}
      }

      // Try to find session ID from args
      const resumeMatch = args.match(/--resume\s+(\S+)/);
      const sessionId = resumeMatch?.[1];

      results.push({ pid, cwd, args, sessionId });
    }

    return results;
  } catch {
    return [];
  }
}
