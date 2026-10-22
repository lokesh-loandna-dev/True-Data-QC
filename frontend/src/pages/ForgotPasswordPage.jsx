import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { notify } from '../utils/toast';

const STEPS = {
  EMAIL: 1,
  OTP: 2,
  PASSWORD: 3,
  SUCCESS: 4,
};

const ForgotPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, resetPasswordWithOtp } = useAuth();

  const [step, setStep] = useState(STEPS.EMAIL);
  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpInputRef = useRef(null);

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  // Focus OTP input when transitioning to OTP step
  useEffect(() => {
    if (step === STEPS.OTP && otpInputRef.current) {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  // Step 1: Send OTP to Email
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = 'Email address is required';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      const msg = 'Please enter a valid email address';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await sendOtp(cleanEmail);
      notify.success(res?.message || 'Verification code sent to your email.');
      setResendCooldown(60);
      setStep(STEPS.OTP);
    } catch (err) {
      const msg = err.message || 'Failed to send verification code. Please check your email.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await sendOtp(email.trim());
      notify.success(res?.message || 'A new verification code has been sent to your email.');
      setResendCooldown(60);
      setOtp('');
    } catch (err) {
      const msg = err.message || 'Failed to resend verification code.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      const msg = 'Please enter the 6-digit verification code';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (cleanOtp.length < 6) {
      const msg = 'Verification code must be 6 digits';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await verifyOtp(email.trim(), cleanOtp);
      notify.success(res?.message || 'Verification successful!');
      if (res?.reset_token) {
        setResetToken(res.reset_token);
      }
      setStep(STEPS.PASSWORD);
    } catch (err) {
      const msg = err.message || 'Invalid verification code. Please try again.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e) => {
    e?.preventDefault();
    if (!password) {
      const msg = 'New password is required';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (password.length < 6) {
      const msg = 'Password must be at least 6 characters long';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (!confirmPassword) {
      const msg = 'Please confirm your new password';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (password !== confirmPassword) {
      const msg = 'Passwords do not match';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await resetPasswordWithOtp(email.trim(), resetToken, password, confirmPassword);
      const successMsg = res?.message || 'Password reset successfully!';
      notify.success(successMsg);
      setStep(STEPS.SUCCESS);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { state: { email: email.trim() } });
      }, 2000);
    } catch (err) {
      const msg = err.message || 'Failed to reset password. Please try again.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Page titles and subtitles based on step
  const getHeaderInfo = () => {
    switch (step) {
      case STEPS.EMAIL:
        return {
          title: 'Forgot Password',
          subtitle: 'Enter your account email address to receive a verification code',
        };
      case STEPS.OTP:
        return {
          title: 'Verify Code',
          subtitle: 'Enter the 6-digit verification code sent to your email',
        };
      case STEPS.PASSWORD:
        return {
          title: 'Set New Password',
          subtitle: 'Create a new secure password for your account',
        };
      case STEPS.SUCCESS:
        return {
          title: 'Password Updated!',
          subtitle: 'Your password has been successfully reset',
        };
      default:
        return { title: 'Reset Password', subtitle: '' };
    }
  };

  const header = getHeaderInfo();

  return (
    <AuthLayout title={header.title} subtitle={header.subtitle}>
      <div className="w-full">
        {/* Step Indicator Progress Bar */}
        {step !== STEPS.SUCCESS && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
              <span className={step >= STEPS.EMAIL ? 'text-blue-600 font-semibold' : ''}>1. Email</span>
              <span className={step >= STEPS.OTP ? 'text-blue-600 font-semibold' : ''}>2. Verify OTP</span>
              <span className={step >= STEPS.PASSWORD ? 'text-blue-600 font-semibold' : ''}>3. New Password</span>
            </div>
            <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{
                  width: step === STEPS.EMAIL ? '33.3%' : step === STEPS.OTP ? '66.6%' : '100%',
                }}
              />
            </div>
          </div>
        )}

        {/* Global Error Alert */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-4 text-sm text-center font-medium animate-shake">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Enter Email */}
        {step === STEPS.EMAIL && (
          <form onSubmit={handleSendOtp} noValidate>
            <CustomInput
              label="Registered Email Address"
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg('');
              }}
              required
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
            />

            <div className="mt-5">
              <CustomButton
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full font-medium"
              >
                {loading ? 'Sending Code...' : 'Send Verification Code'}
              </CustomButton>
            </div>

            <div className="mt-6 text-center text-sm text-gray-500 font-normal">
              Remember your password?{' '}
              <Link to="/login" className="text-blue-600 hover:underline font-medium">
                Log In
              </Link>
            </div>
          </form>
        )}

        {/* STEP 2: Verify OTP */}
        {step === STEPS.OTP && (
          <form onSubmit={handleVerifyOtp} noValidate>
            {/* Target Email Info Badge */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 overflow-hidden">
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <span className="font-medium text-gray-700 truncate">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setStep(STEPS.EMAIL);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2 underline flex-shrink-0"
              >
                Change
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                <span className="text-red-500 mr-1">*</span> Enter 6-Digit OTP
              </label>
              <input
                ref={otpInputRef}
                type="text"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                  setErrorMsg('');
                }}
                className="block w-full h-12 text-center text-2xl tracking-[0.5em] font-mono font-bold text-gray-800 rounded-lg border border-gray-300 focus:border-[#24A1DD] focus:ring-1 focus:ring-[#24A1DD]/25 focus:outline-none transition-all"
              />
              <p className="mt-1.5 text-xs text-gray-500 text-center">
                Check your inbox and spam folder. Code expires in 10 minutes.
              </p>
            </div>

            {/* Resend Cooldown */}
            <div className="flex items-center justify-between text-sm mb-5 text-gray-500">
              <span>Didn't receive the code?</span>
              {resendCooldown > 0 ? (
                <span className="text-gray-400 font-medium">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  Resend Code
                </button>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <CustomButton
                type="button"
                variant="secondary"
                onClick={() => {
                  setErrorMsg('');
                  setStep(STEPS.EMAIL);
                }}
                className="w-1/3"
                disabled={loading}
              >
                Back
              </CustomButton>
              <CustomButton
                type="submit"
                variant="primary"
                disabled={loading || otp.length < 6}
                className="w-2/3 font-medium"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </CustomButton>
            </div>
          </form>
        )}

        {/* STEP 3: Enter New Password & Confirm Password */}
        {step === STEPS.PASSWORD && (
          <form onSubmit={handleResetPassword} noValidate>
            <CustomInput
              label="New Password"
              type="password"
              placeholder="Enter at least 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg('');
              }}
              required
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            />

            <CustomInput
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrorMsg('');
              }}
              required
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            />

            {/* Password Validation Checklist */}
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-5 text-xs text-gray-600 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={password.length >= 6 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                  {password.length >= 6 ? '✓' : '•'}
                </span>
                <span className={password.length >= 6 ? 'text-green-700' : ''}>
                  At least 6 characters long
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={confirmPassword && password === confirmPassword ? 'text-green-600 font-bold' : 'text-gray-400'}>
                  {confirmPassword && password === confirmPassword ? '✓' : '•'}
                </span>
                <span className={confirmPassword && password === confirmPassword ? 'text-green-700' : ''}>
                  Passwords must match
                </span>
              </div>
            </div>

            <div className="mt-5">
              <CustomButton
                type="submit"
                variant="primary"
                disabled={loading || password.length < 6 || password !== confirmPassword}
                className="w-full font-medium"
              >
                {loading ? 'Resetting Password...' : 'Reset Password'}
              </CustomButton>
            </div>
          </form>
        )}

        {/* STEP 4: Success Message & Redirect */}
        {step === STEPS.SUCCESS && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Password Reset Successfully!
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              You can now sign in with your new password. Redirecting to login page...
            </p>
            <CustomButton
              type="button"
              variant="primary"
              onClick={() => navigate('/login', { state: { email: email.trim() } })}
              className="w-full"
            >
              Go to Login Now
            </CustomButton>
          </div>
        )}
      </div>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
