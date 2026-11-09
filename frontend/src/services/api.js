class ApiClient {
  constructor() {
    this.tokenKey = 'ops_qc_token';
    this.refreshTokenKey = 'ops_qc_refresh_token';
  }

  getToken() {
    return sessionStorage.getItem(this.tokenKey);
  }

  getRefreshToken() {
    return sessionStorage.getItem(this.refreshTokenKey);
  }

  setToken(token, refreshToken = null) {
    if (token) {
      sessionStorage.setItem(this.tokenKey, token);
    } else {
      sessionStorage.removeItem(this.tokenKey);
    }

    if (refreshToken) {
      sessionStorage.setItem(this.refreshTokenKey, refreshToken);
    } else if (refreshToken === null && !token) {
      sessionStorage.removeItem(this.refreshTokenKey);
    }
  }

  clearToken() {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.refreshTokenKey);
  }

  async refreshTokenRequest(refreshToken) {
    const apiBaseUrl = window._env_?.VITE_API_URL || window._env_?.VITE_BACKEND_URL || '';
    const res = await fetch(`${apiBaseUrl}/api/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) {
      throw new Error(`Refresh failed with status ${res.status}`);
    }
    return await res.json();
  }

  async request(endpoint, options = {}) {
    const apiBaseUrl = window._env_?.VITE_API_URL || window._env_?.VITE_BACKEND_URL || '';
    const url = `${apiBaseUrl}${endpoint}`;
    
    const isFormData = options.body instanceof FormData;

    // Setup headers
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    };

    // Attach Authorization header if token exists
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    if (config.body && !isFormData && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      
      // Parse JSON response
      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = { message: await response.text() };
      }

      if (!response.ok) {
        // Handle 401 Unauthorized with silent token refresh, matching APEX
        const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/refresh');
        if (response.status === 401 && !isAuthEndpoint) {
          if (!options._retry) {
            const refreshToken = this.getRefreshToken();
            if (refreshToken) {
              try {
                const refreshRes = await this.refreshTokenRequest(refreshToken);
                if (refreshRes && (refreshRes.access_token || refreshRes.token)) {
                  const newToken = refreshRes.access_token || refreshRes.token;
                  const newRefreshToken = refreshRes.refresh_token || refreshToken;
                  this.setToken(newToken, newRefreshToken);
                  
                  // Retry original request with newly issued token
                  return this.request(endpoint, {
                    ...options,
                    _retry: true,
                    headers: {
                      ...options.headers,
                      'Authorization': `Bearer ${newToken}`
                    }
                  });
                }
              } catch (refreshErr) {
                console.error('Silent token refresh failed:', refreshErr);
              }
            }
          }

          // If we reach here, token refresh failed or retry was already attempted
          this.clearToken();
          const detailMsg = data?.detail || data?.message || 'Provided JWT token has expired';
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:session_expired', { 
              detail: { reason: 'unauthorized', message: detailMsg } 
            }));
            if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
              window.location.replace('/login');
            }
          }
        }
        
        const errorMessage = data?.detail || data?.message || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  upload(endpoint, formData, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body: formData });
  }

  async downloadBlob(endpoint, options = {}, onProgress = null) {
    const apiBaseUrl = window._env_?.VITE_API_URL || window._env_?.VITE_BACKEND_URL || '';
    const url = `${apiBaseUrl}${endpoint}`;
    
    const isFormData = options.body instanceof FormData;
    const token = this.getToken();
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };

    let body = options.body;
    if (body && !isFormData && typeof body === 'object') {
      body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      ...options,
      method: options.method || 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      let errorMsg = `HTTP error! status: ${response.status}`;
      try {
        const errJson = await response.json();
        errorMsg = errJson.detail || errJson.message || errorMsg;
      } catch {
        try {
          const txt = await response.text();
          if (txt) errorMsg = txt;
        } catch (_) {}
      }

      if (response.status === 401) {
        if (!options._retry) {
          const refreshToken = this.getRefreshToken();
          if (refreshToken) {
            try {
              const refreshRes = await this.refreshTokenRequest(refreshToken);
              if (refreshRes && (refreshRes.access_token || refreshRes.token)) {
                const newToken = refreshRes.access_token || refreshRes.token;
                const newRefreshToken = refreshRes.refresh_token || refreshToken;
                this.setToken(newToken, newRefreshToken);
                return this.downloadBlob(endpoint, {
                  ...options,
                  _retry: true,
                  headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${newToken}`
                  }
                }, onProgress);
              }
            } catch (refreshErr) {
              console.error('Silent token refresh in downloadBlob failed:', refreshErr);
            }
          }
        }

        // If we reach here, token refresh failed or retry was already attempted
        this.clearToken();
        const detailMsg = errorMsg && errorMsg.includes('expired') ? errorMsg : 'Provided JWT token has expired';
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:session_expired', { 
            detail: { reason: 'unauthorized', message: detailMsg } 
          }));
          if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
            window.location.replace('/login');
          }
        }
      }

      throw new Error(errorMsg);
    }

    if (onProgress && response.body) {
      const contentLengthHeader = response.headers.get('content-length');
      const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total > 0) {
          const pct = Math.min(100, Math.round((loaded / total) * 100));
          onProgress(pct, loaded, total);
        }
      }

      return new Blob(chunks, {
        type: response.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    }

    return await response.blob();
  }
}

export const api = new ApiClient();

// Auth-specific API calls
export const authApi = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (username, email, password) => api.post('/api/auth/register', { username, email, password }),
  sendOtp: (email) => api.post('/api/auth/forgot-password/send-otp', { email }),
  verifyOtp: (email, otp) => api.post('/api/auth/forgot-password/verify-otp', { email, otp }),
  resetPasswordWithOtp: (email, reset_token, password, confirm_password) =>
    api.post('/api/auth/forgot-password/reset-password', { email, reset_token, password, confirm_password }),
  forgotPassword: (email, password, confirm_password) =>
    api.post('/api/auth/forgot-password', { email, password, confirm_password }),
  getProfile: () => api.get('/api/auth/profile'),
  getSessionTimeout: () => api.get('/api/auth/session-timeout'),
  refreshToken: (token) => api.post('/api/auth/refresh-token', token ? { refresh_token: token } : {}),
};

