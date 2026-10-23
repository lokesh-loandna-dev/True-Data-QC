class ApiClient {
  constructor() {
    this.tokenKey = 'ops_qc_token';
  }

  getToken() {
    return sessionStorage.getItem(this.tokenKey);
  }

  setToken(token) {
    if (token) {
      sessionStorage.setItem(this.tokenKey, token);
    } else {
      sessionStorage.removeItem(this.tokenKey);
    }
  }

  clearToken() {
    sessionStorage.removeItem(this.tokenKey);
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
        // Handle 401 Unauthorized globally if token expires
        if (response.status === 401) {
          this.clearToken();
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

  async downloadBlob(endpoint, options = {}) {
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
      if (response.status === 401) {
        this.clearToken();
      }
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
      throw new Error(errorMsg);
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
};

