import { create } from 'zustand';
import { disconnectSocket, reconnectSocket } from '../api/socket';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  totpEnabled: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  initFromStorage: () => void;
}

/**
 * Sessão lida de forma SÍNCRONA na criação do store: assim as rotas protegidas
 * já sabem no primeiro render que o usuário está logado (antes, um F5 ou link
 * direto para /protocols/:id ou /security redirecionava para a tela inicial).
 */
function readStoredSession() {
  try {
    const accessToken = localStorage.getItem('accessToken');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (accessToken && user) return { user, accessToken, isAuthenticated: true };
  } catch {}
  return { user: null, accessToken: null, isAuthenticated: false };
}

export const useAuthStore = create<AuthState>((set) => ({
  ...readStoredSession(),

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    reconnectSocket(); // socket aberto antes do login passa a usar o novo token
    set({ user, accessToken, isAuthenticated: true });
  },

  logout: () => {
    disconnectSocket();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  initFromStorage: () => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, accessToken: token, isAuthenticated: true });
      } catch {}
    }
  },
}));
