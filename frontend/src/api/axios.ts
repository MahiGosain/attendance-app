import axios from 'axios';

const rawApiUrl = import.meta.env.VITE_API_URL?.trim();

const API_URL = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, '')
  : '/api';

export const BASE_URL = API_URL.startsWith('http')
  ? new URL(API_URL).origin
  : window.location.origin;

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
