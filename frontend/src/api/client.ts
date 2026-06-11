import axios from 'axios';
import toast from 'react-hot-toast';

// 20s timeout so a slow/stalled request rejects instead of spinning forever —
// this lets each caller's catch block fire (showing its error/empty state)
// rather than leaving the UI stuck on a loading spinner.
const api = axios.create({ baseURL: '/api', timeout: 20000 });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (err.code === 'ECONNABORTED' || !err.response) {
      // Timeout or network failure — many callers only handle the spinner, so
      // surface a single (deduped) toast instead of failing silently.
      toast.error('The server is taking too long to respond. Please retry.', { id: 'net-timeout' });
    }
    return Promise.reject(err);
  }
);

export default api;
