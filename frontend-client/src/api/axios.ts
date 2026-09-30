import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Erro desconhecido';
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    } else if (error.response?.status !== 404) {
      toast.error(Array.isArray(message) ? message[0] : message);
    }
    return Promise.reject(error);
  },
);

export default api;
