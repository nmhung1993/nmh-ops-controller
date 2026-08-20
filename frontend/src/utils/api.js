const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function apiRequest(path, optionsOrMethod = {}, body = null, extraHeaders = {}) {
  let reqOptions = {};
  if (typeof optionsOrMethod === 'string') {
    reqOptions = {
      method: optionsOrMethod,
      ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
      headers: extraHeaders
    };
  } else {
    reqOptions = { ...optionsOrMethod };
  }

  const token = localStorage.getItem('wc_token') || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(reqOptions.headers || {})
  };

  const targetUrl = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const response = await fetch(targetUrl, {
    ...reqOptions,
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
