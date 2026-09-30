import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('accessToken');
    socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => console.log('WebSocket connected'));
    socket.on('disconnect', () => console.log('WebSocket disconnected'));
    socket.on('connect_error', (err) => console.error('WS error:', err.message));
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
