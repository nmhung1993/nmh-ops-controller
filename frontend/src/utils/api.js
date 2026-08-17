export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('wc_token') || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (response.status === 401) {
    if (localStorage.getItem('wc_token')) {
      localStorage.removeItem('wc_token');
      localStorage.removeItem('wc_user');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
