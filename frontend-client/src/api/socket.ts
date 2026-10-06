import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;
let onAuthFailure: (() => void) | null = null;

/** Chamado quando o servidor recusa o token do socket (ex.: JWT expirado). */
export function setSocketAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

/**
 * Socket.io singleton. O token é lido a cada (re)conexão, então depois de um
 * refresh do JWT a reconexão usa o token novo.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => console.log('WebSocket connected'));
    socket.on('disconnect', () => console.log('WebSocket disconnected'));
    socket.on('connect_error', (err) => console.error('WS error:', err.message));
    // O servidor desconecta sockets com token inválido; renovamos e reconectamos
    socket.on('unauthorized', () => onAuthFailure?.());
  }
  return socket;
}

/** Reabre a conexão com o token atual (após login ou refresh). */
export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
