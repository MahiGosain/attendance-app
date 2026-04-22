import axios from 'axios';

// Use a relative URL so it works on any domain (local or deployed)
const API_URL = '/api';

export const BASE_URL = window.location.origin;

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
