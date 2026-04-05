import { Router } from 'express';
import * as sm from './session-manager';
import * as launcher from './process-launcher';
import { scanClaudeProcesses } from './system-scanner';
import type { CreateSessionBody, InputBody, ResizeBody } from './types';

const router = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

const TOKEN = process.env.CONTROL_TOKEN;

router.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (!TOKEN || auth === `Bearer ${TOKEN}`) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

// GET /api/sessions
router.get('/sessions', (_req, res) => {
  res.json(sm.listSessions());
});

// POST /api/sessions
router.post('/sessions', (req, res) => {
  const body = req.body as CreateSessionBody;
  const type = body.type ?? 'claude';

  let spec: launcher.SpawnSpec;

  if (type === 'terminal') {
    spec = launcher.launchTerminal({ cwd: body.cwd, name: body.name });
  } else {
    spec = launcher.launchClaude({
      cwd: body.cwd,
      agent: body.agent,
      resumeSessionId: body.claudeSessionId,
      name: body.name,
    });
  }

  let meta;
  try {
    meta = sm.createSession({
      ...spec,
      type,
      agent: body.agent,
      claudeSessionId: body.claudeSessionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to spawn process: ${message}` });
  }

  res.status(201).json(meta);
});

// GET /api/sessions/:id
router.get('/sessions/:id', (req, res) => {
  const state = sm.getSession(req.params.id);
  if (!state) return res.status(404).json({ error: 'Session not found' });
  res.json(state.meta);
});

// DELETE /api/sessions/:id
router.delete('/sessions/:id', (req, res) => {
  const ok = sm.killSession(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

// POST /api/sessions/:id/input
router.post('/sessions/:id/input', (req, res) => {
  const body = req.body as InputBody;
  if (typeof body.data !== 'string') {
    return res.status(400).json({ error: 'data must be a string' });
  }
  const ok = sm.sendInput(req.params.id, body.data);
  if (!ok) return res.status(404).json({ error: 'Session not found or exited' });
  res.status(204).send();
});

// POST /api/sessions/:id/resize
router.post('/sessions/:id/resize', (req, res) => {
  const { cols, rows } = req.body as ResizeBody;
  if (!cols || !rows) {
    return res.status(400).json({ error: 'cols and rows required' });
  }
  const ok = sm.resizeSession(req.params.id, cols, rows);
  if (!ok) return res.status(404).json({ error: 'Session not found or exited' });
  res.status(204).send();
});

// ─── Agent presets ────────────────────────────────────────────────────────────

// GET /api/agents
router.get('/agents', (_req, res) => {
  res.json(launcher.getAgentPresets());
});

// GET /api/system-sessions
router.get('/system-sessions', (_req, res) => {
  res.json(scanClaudeProcesses());
});

// ─── Health ───────────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: sm.listSessions().length });
});

export default router;
