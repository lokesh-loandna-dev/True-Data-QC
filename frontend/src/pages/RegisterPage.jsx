import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { notify } from '../utils/toast';

const RegisterPage = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [localLoading, setLocalLoading] = useState(false);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const { register, error: authError } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    if (!username.trim()) {
      setValidationError('Username is required');
      return false;
    }
    if (username.trim().length < 3) {
      setValidationError('Username must be at least 3 characters');
      return false;
    }
    if (!email) {
      setValidationError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setValidationError('Please enter a valid email address');
      return false;
    }
    if (!password) {
      setValidationError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
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
      await register(username.trim(), email.trim(), password);
      setRegisteredEmail(email.trim());
      setIsSubmitted(true);
      notify.success('Registration submitted! Account pending administrator approval.');
    } catch (err) {
      console.error('Registration submit error:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const displayError = validationError || authError;

  if (isSubmitted) {
    return (
      <AuthLayout title="Registration Submitted" subtitle="Account pending administrator approval">
        <div className="w-full flex flex-col items-center text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 mb-5 shadow-2xs">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h3 className="text-base font-semibold text-slate-900 mb-2">
            Verification in Progress
          </h3>

          <p className="text-sm text-slate-600 mb-4 leading-relaxed max-w-sm">
            Your registration for <span className="font-semibold text-slate-800">{registeredEmail}</span> has been received. 
            All new user accounts are set to <span className="font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 text-xs">Inactive</span> by default.
          </p>

          <div className="w-full p-4 mb-6 rounded-xl bg-slate-50 border border-slate-200/80 text-left text-xs text-slate-600 space-y-2">
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#24A1DD] mt-1.5 flex-shrink-0" />
              <span>An administrator will review and activate your account.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#24A1DD] mt-1.5 flex-shrink-0" />
              <span>Once approved, you will be able to sign in with your email and password.</span>
            </div>
          </div>

          <div className="w-full space-y-2.5">
            <CustomButton
              type="button"
              variant="primary"
              onClick={() => navigate('/login', { state: { email: registeredEmail } })}
              className="w-full font-medium"
            >
              Return to Login
            </CustomButton>
            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setUsername('');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
              }}
              className="w-full text-xs text-slate-500 hover:text-slate-800 py-1.5 transition-colors cursor-pointer"
            >
              Register another account
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create Account" subtitle="Register to start managing credentials">
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
          label="Username"
          type="text"
          placeholder="johndoe"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setValidationError('');
          }}
          required
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />

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
          placeholder="Enter password (min 6 characters)"
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
          label="Confirm Password"
          type="password"
          placeholder="Re-enter password"
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
            {localLoading ? 'Registering...' : 'Register'}
          </CustomButton>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500 font-normal">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-500 hover:underline font-medium">
            Log In
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};

export default RegisterPage;
