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
          // Show a toast — deduped by id so this won't stack with the api.js event handler toast
          showError('Your session has expired. Please sign in again.', {
            id: 'session-unauthorized-error',
            duration: 5000,
          });
          // Navigation is handled by ProtectedRoute reacting to isAuthenticated = false;
          // avoid window.location.replace so toast survives the React Router transition
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
      const message = e?.detail?.message || 'Your session has expired. Please sign in again.';
      logout(reason, message);
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
      const { token, access_token, refresh_token, user: loggedInUser } = response;
      const activeToken = access_token || token;
      
      api.setToken(activeToken, refresh_token);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('session_start_time', Date.now().toString());
        sessionStorage.removeItem('session_expired_flag');
        sessionStorage.removeItem('session_expired_reason');
        localStorage.setItem('ops_qc_last_activity', Date.now().toString());
        localStorage.removeItem('ops_qc_logout_event');
      }
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

  const logout = (reason = null, message = null) => {
    api.clearToken();
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('session_start_time');
      sessionStorage.removeItem('session_expired_flag');
      localStorage.removeItem('ops_qc_last_activity');
      localStorage.setItem('ops_qc_logout_event', Date.now().toString());
      // Persist the logout reason so LoginPage can display the right message
      if (reason === 'inactivity') {
        sessionStorage.setItem('session_expired_reason', 'inactivity');
      } else if (reason === 'unauthorized') {
        sessionStorage.setItem('session_expired_reason', 'unauthorized');
      } else {
        sessionStorage.removeItem('session_expired_reason');
      }
    }
    setUser(null);
    setError(null);

    if (reason === 'unauthorized') {
      const displayMsg = message || 'Your session has expired. Please sign in again.';
      showError(displayMsg, {
        id: 'session-unauthorized-error',
        duration: 5000,
      });
      // Navigation handled by ProtectedRoute reacting to isAuthenticated = false
      // No window.location.replace — toast survives the React Router transition
    }
  };

  const refreshSession = async () => {
    try {
      const refreshToken = api.getRefreshToken();
      const response = await authApi.refreshToken(refreshToken);
      const newToken = response?.access_token || response?.token;
      if (newToken) {
        api.setToken(newToken, response?.refresh_token || refreshToken);
        if (response.user) {
          setUser(response.user);
        }
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('session_start_time', Date.now().toString());
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
