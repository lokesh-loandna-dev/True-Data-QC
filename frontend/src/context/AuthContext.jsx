import React, { createContext, useState, useEffect } from 'react';
import { api, authApi } from '../services/api';
import { showWarning, showError } from '../utils/toast';
import { getSessionTimeoutConfig } from '../utils/sessionConfig';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize and check token on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = api.getToken();
      if (token) {
        try {
          const profile = await authApi.getProfile();
          setUser(profile.user || profile);
        } catch (err) {
          console.error('Failed to restore auth session:', err);
          api.clearToken();
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // Listen for global auth session events and cross-tab logout synchronization
  useEffect(() => {
    const handleSessionExpired = (e) => {
      const reason = e?.detail?.reason || 'unauthorized';
      logout(reason);
    };

    const handleStorageChange = (e) => {
      if (e.key === 'ops_qc_logout_event' && e.newValue) {
        api.clearToken();
        setUser(null);
        setError(null);
      }
    };

    window.addEventListener('auth:session_expired', handleSessionExpired);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('auth:session_expired', handleSessionExpired);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.login(email, password);
      const { token, user: loggedInUser } = response;
      
      api.setToken(token);
      localStorage.setItem('ops_qc_last_activity', Date.now().toString());
      localStorage.removeItem('ops_qc_logout_event');
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      const errMsg = err.message || 'Login failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.register(username, email, password);
      return response;
    } catch (err) {
      const errMsg = err.message || 'Registration failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (email) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.sendOtp(email);
      return response;
    } catch (err) {
      const errMsg = err.message || 'Failed to send verification code';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (email, otp) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.verifyOtp(email, otp);
      return response;
    } catch (err) {
      const errMsg = err.message || 'Verification code failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const resetPasswordWithOtp = async (email, resetToken, password, confirmPassword) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.resetPasswordWithOtp(email, resetToken, password, confirmPassword);
      return response;
    } catch (err) {
      const errMsg = err.message || 'Password reset failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async (email, password, confirmPassword) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.forgotPassword(email, password, confirmPassword);
      return response;
    } catch (err) {
      const errMsg = err.message || 'Password update failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const logout = (reason = null) => {
    api.clearToken();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ops_qc_last_activity');
      localStorage.setItem('ops_qc_logout_event', Date.now().toString());
    }
    setUser(null);
    setError(null);

    const { timeoutMinutes } = getSessionTimeoutConfig();

    if (reason === 'inactivity') {
      showWarning(`Your session has expired due to ${timeoutMinutes} minutes of inactivity. Please log in again.`, {
        id: 'session-timeout-warning',
        duration: 6000,
      });
    } else if (reason === 'unauthorized') {
      showError('Your session has expired or is invalid. Please log in again.', {
        id: 'session-unauthorized-error',
        duration: 5000,
      });
    }
  };

  const refreshSession = async () => {
    try {
      const response = await authApi.refreshToken();
      if (response?.token) {
        api.setToken(response.token);
        if (response.user) {
          setUser(response.user);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('ops_qc_last_activity', Date.now().toString());
        }
        return response;
      }
    } catch (err) {
      console.warn('Session refresh attempted but could not be completed:', err.message);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    sendOtp,
    verifyOtp,
    resetPasswordWithOtp,
    forgotPassword,
    logout,
    refreshSession,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
