import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { reconnectSocket, setSocketAuthFailureHandler } from './socket';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function clearSessionAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * Renova o accessToken (15 min) com o refreshToken (7 dias). Várias requisições
 * que expiram juntas compartilham a mesma renovação.
 */
let refreshing: Promise<string> | null = null;
function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    const refreshToken = localStorage.getItem('refreshToken');
    refreshing = (
      refreshToken
        ? axios.post(`${API_URL}/auth/refresh`, { refreshToken }).then((res) => {
            if (!res.data?.accessToken) throw new Error('refresh inválido');
            localStorage.setItem('accessToken', res.data.accessToken);
            localStorage.setItem('refreshToken', res.data.refreshToken);
            reconnectSocket();
            return res.data.accessToken as string;
          })
        : Promise.reject(new Error('sem refresh token'))
    ).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

setSocketAuthFailureHandler(() => {
  if (localStorage.getItem('refreshToken')) refreshAccessToken().catch(clearSessionAndRedirect);
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<any>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthRoute = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        clearSessionAndRedirect();
        return Promise.reject(error);
      }
    }

    const message = error.response?.data?.message || error.message || 'Erro desconhecido';
    if (error.response?.status === 401 && !isAuthRoute) {
      clearSessionAndRedirect();
    } else if (error.response?.status !== 404) {
      toast.error(Array.isArray(message) ? message[0] : message);
    }
    return Promise.reject(error);
  },
);

export default api;
