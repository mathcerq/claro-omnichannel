import { useEffect, useRef } from 'react';
import { getSocket } from '../api/socket';

/**
 * O tempo real chega por eventos do WebSocket. Eventos emitidos enquanto a
 * conexão estava caída (servidor reiniciando, Wi-Fi oscilando, notebook que
 * hibernou) se perdem — então, ao RECONECTAR e ao VOLTAR para a aba, a tela
 * busca o estado atual no servidor.
 */
export function useLiveResync(resync: () => void) {
  const latest = useRef(resync);
  latest.current = resync;

  useEffect(() => {
    const socket = getSocket();
    // Toda (re)conexão sincroniza (na primeira custa só uma requisição a mais)
    const onConnect = () => latest.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    socket.on('connect', onConnect);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
