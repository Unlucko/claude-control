import 'dotenv/config';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { URL } from 'url';
import apiRouter from './api';
import { handleConnection } from './ws-handler';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const CERTS_DIR = path.join(process.cwd(), 'certs');
const CERT_FILE = path.join(CERTS_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERTS_DIR, 'key.pem');

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// API routes
app.use('/api', apiRouter);

// Serve client build (Phase 2+)
const CLIENT_DIST = path.join(process.cwd(), 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'claude-control',
      version: '1.0.0',
      status: 'server running — client not built yet',
      endpoints: {
        health:   'GET  /api/health',
        sessions: 'GET  /api/sessions',
        agents:   'GET  /api/agents',
        create:   'POST /api/sessions',
        delete:   'DELETE /api/sessions/:id',
        input:    'POST /api/sessions/:id/input',
        resize:   'POST /api/sessions/:id/resize',
        ws:       `wss://localhost:${PORT}/ws?token=<CONTROL_TOKEN>`,
      },
    });
  });
}

// ─── HTTPS or HTTP server ─────────────────────────────────────────────────────

let server: https.Server | http.Server;

if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
  server = https.createServer(
    {
      cert: fs.readFileSync(CERT_FILE),
      key:  fs.readFileSync(KEY_FILE),
    },
    app,
  );
  console.log('🔒 TLS enabled');
} else {
  server = http.createServer(app);
  console.warn('⚠️  No certs found in ./certs — running HTTP (not suitable for mobile PWA)');
  console.warn('   Run: npm run gen-certs');
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (reqUrl.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const token = reqUrl.searchParams.get('token') ?? undefined;
  wss.handleUpgrade(req, socket as import('net').Socket, head, (ws) => {
    handleConnection(ws, token);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  const proto = fs.existsSync(CERT_FILE) ? 'https' : 'http';
  console.log(`\n✅ claude-control running`);
  console.log(`   Local:   ${proto}://localhost:${PORT}`);
  console.log(`   Network: ${proto}://0.0.0.0:${PORT}`);
  console.log(`   Token:   ${process.env.CONTROL_TOKEN ?? '(not set)'}`);
  const wsProto = proto === 'https' ? 'wss' : 'ws';
  console.log(`   WS:      ${wsProto}://localhost:${PORT}/ws?token=...\n`);
});
