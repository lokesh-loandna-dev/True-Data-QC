import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import microsoftIcon from '../assets/microsoft.svg';
import { notify } from '../utils/toast';

const LoginPage = () => {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [localLoading, setLocalLoading] = useState(false);

  const { isAuthenticated, loading: authLoading, login, error: authError } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect directly to dashboard
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const validateForm = () => {
    if (!email) {
      const msg = 'Email is required';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const msg = 'Please enter a valid email address';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    if (!password) {
      const msg = 'Password is required';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLocalLoading(true);
    try {
      await login(email, password);
      notify.success('Login successful! Redirecting...');

      // Default page after login is always /dashboard for both admin and users
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const errMsg = err.message || 'Invalid credentials or login failed.';
      notify.error(errMsg);
      console.error('Login submit error:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleMicrosoftLogin = () => {
    const backendUrl = window._env_?.VITE_API_URL || window._env_?.VITE_BACKEND_URL || '';
    window.location.href = `${backendUrl}/api/auth/ValidateAzureAD`;
  };

  const displayError = validationError || authError;

  return (
    <AuthLayout title="Welcome Back" subtitle="Log in to access your dashboard">
      <form onSubmit={handleSubmit} className="w-full" noValidate>
        {displayError && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-4 text-sm text-center font-medium animate-shake">
            {displayError}
          </div>
        )}

        <CustomInput
          label="Email Address"
          type="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setValidationError('');
          }}
          required
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />

        <CustomInput
          label="Password"
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setValidationError('');
          }}
          required
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />

        <div className="flex justify-end mb-5 -mt-2">
          <Link
            to="/forgot-password"
            state={{ email }}
            className="text-sm text-blue-500 hover:underline font-medium"
          >
            Forgot password?
          </Link>
        </div>

        <div className="mt-4">
          <CustomButton
            type="submit"
            variant="primary"
            disabled={localLoading}
            className="w-full font-medium"
          >
            {localLoading ? 'Signing in...' : 'Login'}
          </CustomButton>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            className="
              w-full h-11
              flex items-center justify-center gap-3
              border border-[#0078D4]
              rounded-lg
              bg-white
              hover:bg-[#f5faff]
              transition
              cursor-pointer
            "
          >
            <img
              src={microsoftIcon}
              alt="Microsoft"
              className="w-5 h-5"
            />
            <span className="text-base font-medium text-gray-800">
              Microsoft
            </span>
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500 font-normal">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-500 hover:underline font-medium">
            Register
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
