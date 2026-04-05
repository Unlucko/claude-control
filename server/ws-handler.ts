import type WebSocket from 'ws';
import * as sm from './session-manager';
import type { WsClientMessage } from './types';

const TOKEN = process.env.CONTROL_TOKEN;

export function handleConnection(ws: WebSocket, token?: string): void {
  // Validate token
  if (TOKEN && token !== TOKEN) {
    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  sm.registerConnection(ws);

  ws.on('message', (raw) => {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as WsClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'subscribe':
        if (!sm.subscribeToSession(msg.sessionId, ws)) {
          ws.send(JSON.stringify({ type: 'error', message: `Session ${msg.sessionId} not found` }));
        }
        break;

      case 'unsubscribe':
        sm.unsubscribeFromSession(msg.sessionId, ws);
        break;

      case 'input': {
        const ok = sm.sendInput(msg.sessionId, msg.data);
        if (!ok) {
          ws.send(JSON.stringify({ type: 'error', message: `Session ${msg.sessionId} not found or exited` }));
        }
        break;
      }

      case 'resize': {
        sm.resizeSession(msg.sessionId, msg.cols, msg.rows);
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });
}
