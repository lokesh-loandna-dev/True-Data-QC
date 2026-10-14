import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { notify } from '../utils/toast';

const ForgotPasswordPage = () => {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [localLoading, setLocalLoading] = useState(false);

  const { forgotPassword, error: authError } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    if (!email.trim()) {
      const msg = 'Email address is required';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      const msg = 'Please enter a valid email address';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    if (!password) {
      const msg = 'Updated password is required';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    if (password.length < 6) {
      const msg = 'Updated password must be at least 6 characters';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    if (!confirmPassword) {
      const msg = 'Please confirm your updated password';
      setValidationError(msg);
      notify.warning(msg);
      return false;
    }
    if (password !== confirmPassword) {
      const msg = 'Updated passwords do not match';
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
    setSuccessMessage('');
    try {
      const res = await forgotPassword(email.trim(), password, confirmPassword);
      const successMsg = res?.message || 'Password updated successfully! Redirecting to login...';
      notify.success(successMsg);
      setSuccessMessage(successMsg);
      setTimeout(() => {
        navigate('/login', { state: { email: email.trim() } });
      }, 1500);
    } catch (err) {
      const errMsg = err.message || 'Failed to update password. Please check your details.';
      notify.error(errMsg);
      setValidationError(errMsg);
      console.error('Password reset submit error:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const displayError = validationError || authError;

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Enter your email address and new password to update your account"
    >
      <form onSubmit={handleSubmit} className="w-full" noValidate>
        {/* Error Displays */}
        {displayError && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-4 text-sm text-center font-medium animate-shake">
            {displayError}
          </div>
        )}

        {/* Success Display */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-2.5 rounded-lg mb-4 text-sm text-center font-medium">
            {successMessage}
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
          label="Updated Password"
          type="password"
          placeholder="Enter updated password (min 6 characters)"
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

        <CustomInput
          label="Updated Confirm Password"
          type="password"
          placeholder="Re-enter updated password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setValidationError('');
          }}
          required
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />

        <div className="mt-6">
          <CustomButton
            type="submit"
            variant="primary"
            disabled={localLoading}
            className="w-full font-medium"
          >
            {localLoading ? 'Updating Password...' : 'Update Password'}
          </CustomButton>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500 font-normal">
          Remember your password?{' '}
          <Link to="/login" className="text-blue-500 hover:underline font-medium">
            Log In
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
